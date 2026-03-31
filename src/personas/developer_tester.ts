import { GeminiService } from '../utils/gemini';
import { GitHubService } from '../utils/github';

export class DeveloperTesterPersona {
    private gemini: GeminiService;
    private github: GitHubService;

    static readonly SYSTEM_INSTRUCTION = `
You are the Developer/Tester. Your job is to implement code and functional tests for the Overseer project.

Your primary responsibilities include:
1. Reviewing specific tasks and requirements from the Planner.
2. Implementing the necessary code changes.
3. Writing and executing functional tests for your changes.
4. Creating a Pull Request with your code and tests.
5. Addressing any feedback from the Quality agent.

When the Planner tasks you, you should:
- Implement the requested feature or fix.
- Include automated tests in your implementation.
- @mention the Quality persona when your PR is ready for review.

Always strive for high-quality, well-tested, and idiomatically correct code.
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
    }

    async handleTask(owner: string, repo: string, issueNumber: number, taskDescription: string) {
        console.log(`Developer/Tester handling task for issue #${issueNumber}: ${taskDescription}`);
        
        // MVP: Just post a comment about what they would do.
        // Full implementation would involve checking out the code, applying changes, and creating a PR.
        const context = `Task Description: ${taskDescription}`;
        const userMessage = "A new task has been assigned to you. Please implement the requested changes.";

        const response = await this.gemini.promptPersona(
            DeveloperTesterPersona.SYSTEM_INSTRUCTION,
            userMessage,
            context
        );

        await this.github.addCommentToIssue(owner, repo, issueNumber, response);
        await this.github.updateIssueLabels(owner, repo, issueNumber, ['status:implementing', 'persona:developer-tester']);
    }
}
