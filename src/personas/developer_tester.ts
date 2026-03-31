import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';
import { PersonaHelper } from '../utils/persona_helper.js';

export class DeveloperTesterPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Developer/Tester, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to implement code and functional tests for the Overseer project.

Environment & Capabilities:
- You have full shell access to the repository workspace.
- You can execute commands using the syntax: [RUN:command]. Use this to run tests, build code, and verify your changes.
- You can read and write files directly using standard Unix tools or the [FILE] syntax.
- You can modify 'flake.nix' to install new software dependencies.

When the Planner or Overseer tasks you, you must:
1.  Implement the requested feature or fix.
2.  Include automated functional tests for your changes.
3.  Specify the exact file paths for your code and tests.
4.  Use the format: [FILE:path/to/file.ts]...content...[/FILE] to indicate the file contents.

Always strive for high-quality, well-tested, and idiomatically correct code.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleTask(owner: string, repo: string, issueNumber: number, taskDescription: string): Promise<string> {
        console.log(`Developer/Tester handling task for issue #${issueNumber}: ${taskDescription}`);
        
        const attribution = PersonaHelper.getAttribution('Developer/Tester', issueNumber);
        const context = `Task Description: ${taskDescription}`;
        const userMessage = "A new task has been assigned to you. Please implement the requested changes.";

        const response = await this.gemini.promptPersona(
            DeveloperTesterPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        // Parse multiple files if present
        const fileRegex = /\[FILE:(.+?)\]([\s\S]+?)\[\/FILE\]/g;
        let match;
        let filePaths = [];
        
        const branchName = `bot/issue-${issueNumber}`;
        let branchCreated = false;

        while ((match = fileRegex.exec(response)) !== null) {
            if (!branchCreated) {
                try {
                    await this.github.createBranch(owner, repo, branchName);
                } catch (e) {
                    // Branch might already exist, which is fine for update
                    console.log(`Branch ${branchName} already exists or could not be created.`);
                }
                branchCreated = true;
            }
            const filePath = match[1];
            const content = match[2].trim();
            filePaths.push(filePath);
            await this.github.createOrUpdateFile(owner, repo, filePath, `feat: implementation for #${issueNumber}`, content, branchName);
        }

        let finalComment = attribution + response;
        if (filePaths.length > 0) {
            try {
                const pr = await this.github.createPullRequest(owner, repo, `Resolve issue #${issueNumber}`, `Automated PR by Developer/Tester for issue #${issueNumber}`, branchName);
                finalComment += `\n\nA new PR has been created: #${pr.data.number} (${pr.data.html_url})`;
            } catch (e) {
                // PR might already exist
                finalComment += `\n\nExisting PR for branch ${branchName} has been updated with new changes.`;
            }
            finalComment += `\n\nI have implemented the following files: ${filePaths.join(', ')}.`;
        }

        return finalComment;
    }
}
