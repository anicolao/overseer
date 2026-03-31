import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';
import { PersonaHelper } from '../utils/persona_helper.js';

export class QualityPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Quality agent. Your job is to verify and review the work of developers and testers.

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
        let context = `Issue Number: ${issueNumber}\nDeveloper: ${developer}\n`;

        try {
            // 1. Review specific PR if provided
            if (prNumber > 0) {
                const files = await this.github.getPullRequestFiles(owner, repo, prNumber);
                context += `\nPull Request #${prNumber} Files:\n`;
                for (const file of files.data) {
                    context += `\n--- File: ${file.filename} ---\n`;
                    if (file.status !== 'removed') {
                        try {
                            const content = await this.github.getFileContent(owner, repo, file.filename, file.contents_url.split('ref=')[1] || 'main');
                            context += content + '\n';
                        } catch (e) {
                            context += `(Could not fetch content: ${e instanceof Error ? e.message : String(e)})\n`;
                        }
                    }
                }
            } 
            
            // 2. Always inspect the latest repository state for overall quality
            context += "\n\n--- CURRENT REPOSITORY STATE (Source Files) ---\n";
            const repoFiles = await this.github.getFilesRecursive(owner, repo, 'src');
            for (const file of repoFiles) {
                // Filter for source files to keep context manageable
                if (file.path.endsWith('.ts') || file.path.endsWith('.js') || file.path.endsWith('.md')) {
                    context += `\n--- File: ${file.path} ---\n`;
                    context += file.content + '\n';
                }
            }

        } catch (error) {
            context += `\nError gathering repository context: ${error instanceof Error ? error.message : String(error)}`;
        }

        const userMessage = "A quality review has been requested. Please review the implementation and the overall repository state provided in the context above against the project requirements and engineering standards.";

        const response = await this.gemini.promptPersona(
            QualityPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        return attribution + response;
    }
}
