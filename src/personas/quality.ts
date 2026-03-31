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

When the Developer/Tester tasks you, you should:
- Review the code changes and tests in the PR.
- Verify them against the original requirements from the Product/Architect.
- @mention the Overseer once your review is complete and the PR is ready for merging.

Maintain a professional, critical but constructive, and high-quality-oriented approach.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleReviewRequest(owner: string, repo: string, issueNumber: number, prNumber: number, developer: string) {
        console.log(`Quality agent handling review request from ${developer} for PR #${prNumber} on issue #${issueNumber}`);
        
        const { shouldContinue, attribution } = await PersonaHelper.checkLimitAndGetAttribution(
            this.github, owner, repo, issueNumber, 'Quality', '@quality', developer, `Review request for PR #${prNumber}`
        );
        if (!shouldContinue) return;

        let context = `Issue Number: ${issueNumber}\nDeveloper: ${developer}\n`;
        
        try {
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
            } else {
                context += "\nNo specific PR number provided. Reviewing the latest state of the repository relative to the issue goals.";
            }
        } catch (error) {
            context += `\nError gathering PR context: ${error instanceof Error ? error.message : String(error)}`;
        }

        const userMessage = "A review request has been assigned to you. Please review the implementation provided in the context above against the project requirements.";

        const response = await this.gemini.promptPersona(
            QualityPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        await this.github.addCommentToIssue(owner, repo, issueNumber, attribution + response);
        await this.github.updateIssueLabels(owner, repo, issueNumber, ['status:reviewing', 'persona:quality']);
    }
}
