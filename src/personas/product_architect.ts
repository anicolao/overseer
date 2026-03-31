import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';
import { PersonaHelper } from '../utils/persona_helper.js';

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

Maintain a clear, concise, and structured approach.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleMention(owner: string, repo: string, issueNumber: number, mentioner: string, body: string) {
        console.log(`Product/Architect handling mention from ${mentioner} in issue #${issueNumber}`);
        
        const attribution = PersonaHelper.getAttribution('Product/Architect', issueNumber, mentioner);
        const issue = await this.github.getIssue(owner, repo, issueNumber);
        const context = `Issue: ${issue.data.title}\n\nDescription:\n${issue.data.body}\n\nLatest mention body:\n${body}`;
        const userMessage = "Define the requirements and design, and specify the file path to save them.";

        const response = await this.gemini.promptPersona(
            ProductArchitectPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        // Parse multiple files if present
        const fileRegex = /\[FILE:(.+?)\]([\s\S]+?)\[\/FILE\]/g;
        let match;
        let filePaths = [];
        while ((match = fileRegex.exec(response)) !== null) {
            const filePath = match[1];
            const content = match[2].trim();
            filePaths.push(filePath);
            await this.github.createOrUpdateFile(owner, repo, filePath, `docs: architect design for #${issueNumber}`, content);
        }

        let finalComment = attribution + response;
        if (filePaths.length > 0) {
            finalComment += `\n\nI have created the following design documents: ${filePaths.join(', ')}.`;
        }

        await this.github.addCommentToIssue(owner, repo, issueNumber, finalComment);
    }
}
