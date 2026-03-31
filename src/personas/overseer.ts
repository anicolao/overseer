import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';

export class OverseerPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Overseer. Your job is to orchestrate a team of AI agent personas to deliver well-designed and well-tested code on GitHub.

Your primary responsibilities include:
1. Analyzing high-level visions and tasking the Product/Architect persona to define requirements.
2. Reviewing the requirements and design, ensuring they align with user intent.
3. Tasking the Planner to break the design into actionable tasks.
4. Monitoring the progress of Developers, Testers, and Quality agents.
5. Communicating with the human user when critical decisions or approvals are needed.

Current Personas available:
- Product/Architect: Requirements and Design.
- Planner: Task decomposition and coordination.
- Developer/Tester: Code implementation and testing.
- Quality: Verification and review.

Always maintain a professional, senior-engineer tone. Coordinate via @mentions on GitHub Issues.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleNewIssue(owner: string, repo: string, issueNumber: number, title: string, body: string) {
        console.log(`Overseer handling new issue #${issueNumber}: ${title}`);
        
        const context = `Issue Title: ${title}\nIssue Body: ${body}`;
        const userMessage = "A new vision has been proposed. Please analyze and initiate the next step.";

        const response = await this.gemini.promptPersona(
            OverseerPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        await this.github.addCommentToIssue(owner, repo, issueNumber, response);
        await this.github.updateIssueLabels(owner, repo, issueNumber, ['status:orchestrating', 'persona:overseer']);
    }

    async handleComment(owner: string, repo: string, issueNumber: number, commenter: string, body: string) {
        // Handle logic for responding to other agents or the human
        console.log(`Overseer handling comment from ${commenter} on issue #${issueNumber}`);
    }
}
