import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';
import { PersonaHelper } from '../utils/persona_helper.js';

export class OverseerPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Overseer. Your job is to orchestrate a team of AI agent personas to deliver well-designed and well-tested code on GitHub.

Your primary responsibilities include:
1. Analyzing high-level visions and tasking personas.
2. Reviewing work and coordinating design-level agreement.
3. Monitoring progress and communicating with the human user.

Communication Protocol:
- Always coordinate via @mentions on GitHub Issues.
- Maintain a professional, senior-engineering tone.
- YOU MUST end every output with the following exact phrase to delegate the next step: "Next step: @persona to take action" (e.g., "Next step: @planner to take action").
- If you are waiting for a human or the task is finished, end with: "Next step: human review required".

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

    async handleNewIssue(owner: string, repo: string, issueNumber: number, title: string, body: string): Promise<string> {
        console.log(`Overseer handling new issue #${issueNumber}: ${title}`);
        
        if (await PersonaHelper.isLimitReached(this.github, owner, repo, issueNumber, 'Overseer', '@overseer', body)) {
            return '';
        }

        const attribution = PersonaHelper.getAttribution('Overseer', issueNumber);
        const context = `Issue Title: ${title}\nIssue Body: ${body}`;
        const userMessage = "A new vision has been proposed. Please analyze and initiate the next step.";

        const response = await this.gemini.promptPersona(
            OverseerPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        return attribution + response;
    }

    async handleComment(owner: string, repo: string, issueNumber: number, commenter: string, body: string): Promise<string> {
        console.log(`Overseer handling comment from ${commenter} on issue #${issueNumber}`);
        
        if (await PersonaHelper.isLimitReached(this.github, owner, repo, issueNumber, 'Overseer', '@overseer', body)) {
            return '';
        }

        const attribution = PersonaHelper.getAttribution('Overseer', issueNumber, commenter);
        const context = await this.github.getFullIssueContext(owner, repo, issueNumber);
        const userMessage = "The issue has been updated. Please review the full context and decide the next step.";

        const response = await this.gemini.promptPersona(
            OverseerPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        return attribution + response;
    }
}
