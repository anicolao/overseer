import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';

export class DeveloperTesterPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Developer/Tester. Your job is to implement code and functional tests for the Overseer project.

When the Planner tasks you, you must:
1.  Implement the requested feature or fix.
2.  Include automated functional tests for your changes.
3.  Specify the exact file paths for your code and tests.
4.  Use the format: [FILE:path/to/file.ts]...content...[/FILE] to indicate the file contents.

Example:
[FILE:src/utils/new-feature.ts]
export class NewFeature { ... }
[/FILE]

@mention the Quality persona when your implementation is ready for review.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleTask(owner: string, repo: string, issueNumber: number, taskDescription: string) {
        console.log(`Developer/Tester handling task for issue #${issueNumber}: ${taskDescription}`);
        
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
        while ((match = fileRegex.exec(response)) !== null) {
            const filePath = match[1];
            const content = match[2].trim();
            filePaths.push(filePath);
            await this.github.createOrUpdateFile(owner, repo, filePath, `feat: implementation for #${issueNumber}`, content);
        }

        if (filePaths.length > 0) {
            await this.github.addCommentToIssue(owner, repo, issueNumber, `I have implemented the following files: ${filePaths.join(', ')}.\n\n${response}`);
        } else {
            await this.github.addCommentToIssue(owner, repo, issueNumber, response);
        }

        await this.github.updateIssueLabels(owner, repo, issueNumber, ['status:implementation-ready', 'persona:developer-tester']);
    }
}
