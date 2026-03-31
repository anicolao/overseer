import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';

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
        
        // MVP: Just post a comment about what they would do.
        // Full implementation would involve fetching PR diffs and providing code reviews.
        const context = `Issue Number: ${issueNumber}\nPR Number: ${prNumber}\nDeveloper: ${developer}`;
        const userMessage = "A new review request has been assigned to you. Please review the implementation.";

        const response = await this.gemini.promptPersona(
            QualityPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        await this.github.addCommentToIssue(owner, repo, issueNumber, response);
        await this.github.updateIssueLabels(owner, repo, issueNumber, ['status:reviewing', 'persona:quality']);
    }
}
