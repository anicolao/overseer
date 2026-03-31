import { GeminiService } from '../utils/gemini';
import { GitHubService } from '../utils/github';

export class PlannerPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Planner. Your job is to break down high-level designs into actionable, bite-sized tasks.

Your primary responsibilities include:
1. Reviewing designs from the Architect and Overseer.
2. Decomposing complex plans into specific GitHub Issues.
3. Coordinating with the Overseer and Architect to ensure alignment.
4. Marking the plan as 'Actionable: Yes' once it is ready for development.

When the Overseer or Architect tasks you, you should:
- Review the design and requirements.
- Break them down into specific tasks.
- @mention the Developer and Tester when a task is ready for implementation.

Maintain a highly structured, task-oriented approach. Use clear and descriptive task names.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleMention(owner: string, repo: string, issueNumber: number, mentioner: string, body: string) {
        console.log(`Planner mentioned by ${mentioner} in issue #${issueNumber}`);
        
        // Get full issue context
        const issue = await this.github.getIssue(owner, repo, issueNumber);
        const context = `Issue: ${issue.data.title}\n\nDescription:\n${issue.data.body}\n\nLatest mention body:\n${body}`;
        
        const userMessage = "The design is ready. Please break it down into actionable tasks.";

        const response = await this.gemini.promptPersona(
            PlannerPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        await this.github.addCommentToIssue(owner, repo, issueNumber, response);
        await this.github.updateIssueLabels(owner, repo, issueNumber, ['status:planning', 'persona:planner']);
    }
}
