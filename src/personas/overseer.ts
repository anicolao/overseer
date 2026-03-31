import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';

export class OverseerPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Overseer. Your job is to orchestrate a team of AI agent personas to deliver well-designed and well-tested code on GitHub.

Your primary responsibilities include:
1. Analyzing high-level visions and tasking the Product/Architect persona (via @product-architect) to define requirements and technical design.
2. Reviewing the requirements and design, ensuring they align with user intent.
3. Once the design is ready, tasking the Planner (via @planner) to break the design into actionable tasks.
4. Coordinating design-level agreement between yourself, the Architect, and the Planner before marking a plan as actionable.
5. Monitoring the progress of Developers, Testers, and Quality agents.
6. Proactively reaching out to the human user for high-level approvals or when critical decisions are required.

Communication Protocol:
- Always coordinate via @mentions on GitHub Issues.
- Maintain a professional, senior-engineering tone.
- Be proactive and clear in your instructions to other personas.
- Ensure that the workflow follows the sequence: Vision -> Product/Architect -> Planner -> Execution.

Current Personas available:
- @product-architect: Requirements and High-level Design.
- @planner: Task decomposition and coordination.
- @developer-tester: Code implementation and testing.
- @quality: Verification and review.
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
        console.log(`Overseer handling comment from ${commenter} on issue #${issueNumber}`);
        
        const issue = await this.github.getIssue(owner, repo, issueNumber);
        const context = `Issue: ${issue.data.title}\n\nDescription:\n${issue.data.body}\n\nNew comment from ${commenter}:\n${body}`;
        const userMessage = "A persona or human has commented and mentioned you. Please respond accordingly to keep the workflow moving.";

        const response = await this.gemini.promptPersona(
            OverseerPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        await this.github.addCommentToIssue(owner, repo, issueNumber, response);
    }
}
