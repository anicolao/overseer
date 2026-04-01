import { GeminiService } from '../utils/gemini.js';
import { GitHubService } from '../utils/github.js';
import { PersonaHelper } from '../utils/persona_helper.js';
import { AgentRunner } from '../utils/agent_runner.js';
import type { IterationResult } from '../utils/agent_runner.js';

export class DeveloperTesterPersona {
    private gemini: GeminiService;
    private github: GitHubService;
    private runner: AgentRunner;

    static readonly SYSTEM_INSTRUCTION = `
You are the Developer/Tester, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to implement code and functional tests.

AUTONOMOUS RULES:
1. **Plan-Act-Verify:** Always use [RUN:command] to explore the codebase, apply changes, and then run verification commands (lint, test, build).
2. **Persistence:** Use standard git commands to commit and push your changes to your working branch.
3. **Repo-Centric Communication:** Large amounts of technical detail should be in code comments or documentation files.
4. **Conciseness:** Your final response must be a maximum 3-sentence summary of the changes you implemented and the verification results.
5. **Handoff:** You do not delegate. Provide your summary and the Dispatcher will return control to the Overseer.

You are authorized to modify any file in the repository using standard Unix tools via [RUN:command].
    `;

    constructor(gemini: GeminiService, github: GitHubService) {
        this.gemini = gemini;
        this.github = github;
        this.runner = new AgentRunner();
    }

    async handleTask(owner: string, repo: string, issueNumber: number, taskDescription: string): Promise<IterationResult> {
        console.log(`Developer/Tester handling task for issue #${issueNumber}: ${taskDescription}`);
        
        const attribution = PersonaHelper.getAttribution('Developer/Tester', issueNumber);
        const fullContext = await this.github.getFullIssueContext(owner, repo, issueNumber);
        const initialMessage = `${attribution}\nThe Overseer has tasked you with implementation: ${taskDescription}\n\nPlease proceed with the Plan-Act-Verify cycle in the repository.`;

        return this.runner.runAutonomousLoop(this.gemini, DeveloperTesterPersona.SYSTEM_INSTRUCTION, initialMessage + "\n\nCONTEXT:\n" + fullContext);
    }
}
