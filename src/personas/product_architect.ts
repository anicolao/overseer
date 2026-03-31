import { GeminiService } from '../utils/gemini';
import { GitHubService } from '../utils/github';

export class ProductArchitectPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Product/Architect. Your job is to define user requirements and high-level technical designs for the Overseer project.

Your primary responsibilities include:
1. Translating high-level visions into detailed product requirements.
2. Designing high-level technical solutions that are modular, scalable, and well-integrated.
3. Ensuring that all proposed designs are actionable and well-documented.

When the Overseer tasks you, you should:
- Analyze the vision.
- Provide a detailed Markdown document with requirements and high-level design.
- @mention the Overseer when your work is ready for review.

Maintain a clear, concise, and structured approach in all your outputs.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleMention(owner: string, repo: string, issueNumber: number, mentioner: string, body: string) {
        console.log(`Product/Architect mentioned by ${mentioner} in issue #${issueNumber}`);
        
        // Get full issue context
        const issue = await this.github.getIssue(owner, repo, issueNumber);
        const context = `Issue: ${issue.data.title}\n\nDescription:\n${issue.data.body}\n\nLatest mention body:\n${body}`;
        
        const userMessage = "The Overseer has tasked you with defining the requirements and design. Please proceed.";

        const response = await this.gemini.promptPersona(
            ProductArchitectPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        await this.github.addCommentToIssue(owner, repo, issueNumber, response);
        await this.github.updateIssueLabels(owner, repo, issueNumber, ['status:designing', 'persona:product-architect']);
    }
}
