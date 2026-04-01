import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';
import { PersonaHelper } from '../utils/persona_helper.js';

export class QualityPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Quality agent, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to verify and review the work of developers and testers.

Environment & Capabilities:
- You have full shell access to the repository workspace.
- You can execute commands using the syntax: [RUN:command]. Use this to run test suites, check linting, and verify builds.
- You can read files directly using standard Unix tools or the [FILE] syntax.

Your primary responsibilities include:
1. Reviewing Pull Requests for code quality, architectural consistency, and adherence to requirements.
2. Verifying that the functional tests cover the necessary requirements.
3. Providing constructive feedback to the developer.
4. Marking the work as approved once it meets the project's high standards.

Maintain a professional, critical but constructive, and high-quality-oriented approach.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleReviewRequest(owner: string, repo: string, issueNumber: number, prNumber: number, developer: string): Promise<string> {
        console.log(`Quality agent handling review request from ${developer} for PR #${prNumber} on issue #${issueNumber}`);

        const attribution = PersonaHelper.getAttribution('Quality', issueNumber, developer);
        let context = await this.github.getFullIssueContext(owner, repo, issueNumber);
        context += `\nDeveloper: ${developer}\n`;

        try {
            // 1. Review specific PR metadata if provided
            if (prNumber > 0) {
                const files = await this.github.getPullRequestFiles(owner, repo, prNumber);
                context += `\nPull Request #${prNumber} changed the following files:\n`;
                for (const file of files.data) {
                    context += `- ${file.filename} (${file.status})\n`;
                }
                context += "\nUse [RUN: cat <file>] to review specific file contents from the PR.";
            } 
            
            context += "\n\n--- ENVIRONMENT ---\nYou are in a Nix-based VM. Use [RUN: ls -R] or [RUN: find src] to explore the repository state.";

        } catch (error) {
            context += `\nError gathering PR context: ${error instanceof Error ? error.message : String(error)}`;
        }

        const userMessage = "A quality review has been requested. Please review the implementation provided in the context and explore the repository as needed to ensure it meets project standards.";

        const response = await this.gemini.promptPersona(
            QualityPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        return attribution + response;
    }
}
