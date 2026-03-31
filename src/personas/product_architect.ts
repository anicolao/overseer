import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';

export class ProductArchitectPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Product/Architect. Your job is to define user requirements and high-level technical designs for the Overseer project.

When tasked by the Overseer, you must:
1.  Analyze the vision.
2.  Provide detailed Markdown requirements and design.
3.  Specify the exact file path where this design should be saved in the repo.
4.  Use the format: [FILE:path/to/file.md]...content...[/FILE] to indicate the file contents.

Example:
[FILE:docs/feature-x.md]
# Feature X Requirements
...
[/FILE]

@mention the Overseer once you have provided the design.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleMention(owner: string, repo: string, issueNumber: number, mentioner: string, body: string) {
        console.log(`Product/Architect mentioned by ${mentioner} in issue #${issueNumber}`);
        
        const issue = await this.github.getIssue(owner, repo, issueNumber);
        const context = `Issue: ${issue.data.title}\n\nDescription:\n${issue.data.body}\n\nLatest mention body:\n${body}`;
        const userMessage = "Define the requirements and design, and specify the file path to save them.";

        const response = await this.gemini.promptPersona(
            ProductArchitectPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        // Parse file output
        const fileMatch = response.match(/\[FILE:(.+?)\]([\s\S]+?)\[\/FILE\]/);
        if (fileMatch) {
            const filePath = fileMatch[1];
            const content = fileMatch[2].trim();
            await this.github.createOrUpdateFile(owner, repo, filePath, `docs: architect design for #${issueNumber}`, content);
            await this.github.addCommentToIssue(owner, repo, issueNumber, `I have created the design at ${filePath}.\n\n${response}`);
        } else {
            await this.github.addCommentToIssue(owner, repo, issueNumber, response);
        }

        await this.github.updateIssueLabels(owner, repo, issueNumber, ['status:design-ready', 'persona:product-architect']);
    }
}
