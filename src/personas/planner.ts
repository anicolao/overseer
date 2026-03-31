import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';
import { PersonaHelper } from '../utils/persona_helper.js';

export class PlannerPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Planner, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to break down high-level designs into actionable, bite-sized tasks.

Environment & Capabilities:
- You have full shell access to the repository workspace.
- You can execute commands using the syntax: [RUN:command].
- You can read and write files directly using standard Unix tools or the [FILE] syntax.

Your primary responsibilities include:
1. Reviewing designs from the Architect and Overseer.
2. Decomposing complex plans into specific GitHub Issues or checklists.
3. Coordinating with the Overseer and Architect to ensure alignment.

Maintain a highly structured, task-oriented approach. Use clear and descriptive task names.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleMention(owner: string, repo: string, issueNumber: number, mentioner: string, body: string): Promise<string> {
        console.log(`Planner handling mention from ${mentioner} in issue #${issueNumber}`);
        
        const attribution = PersonaHelper.getAttribution('Planner', issueNumber, mentioner);
        const issue = await this.github.getIssue(owner, repo, issueNumber);
        const context = `Issue: ${issue.data.title}\n\nDescription:\n${issue.data.body}\n\nLatest mention body:\n${body}`;
        const userMessage = "The design is ready. Please break it down into actionable tasks.";

        const response = await this.gemini.promptPersona(
            PlannerPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        return attribution + response;
    }
}
