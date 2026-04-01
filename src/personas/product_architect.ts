import { AgentRunner, type IterationResult } from "../utils/agent_runner.js";
import type { GeminiService } from "../utils/gemini.js";
import type { GitHubService } from "../utils/github.js";
import { getAttribution } from "../utils/persona_helper.js";

export class ProductArchitectPersona {
	private gemini: GeminiService;
	private github: GitHubService;
	private runner: AgentRunner;

	static readonly SYSTEM_INSTRUCTION = `
You are the Product/Architect, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to define requirements and high-level technical designs.

AUTONOMOUS RULES:
1. **Internal Iteration:** Use [RUN:command] to explore the codebase and verify your design before finalizing.
2. **Repo-Centric Communication:** Write detailed requirements and architectural documents directly to files in the repository (e.g., in docs/architecture/).
3. **Conciseness:** Your final response must be a maximum 3-sentence summary of the files you created or updated. DO NOT include the full content of the documents in your final comment.
4. **Handoff:** You do not delegate. Simply provide your summary and the Dispatcher will return control to the Overseer.

You are authorized to modify files using [RUN:command] (cat, sed, etc.) or standard Unix tools.
    `;

	constructor(gemini: GeminiService, github: GitHubService) {
		this.gemini = gemini;
		this.github = github;
		this.runner = new AgentRunner();
	}

	async handleMention(
		owner: string,
		repo: string,
		issueNumber: number,
		mentioner: string,
		body: string,
		commentUrl?: string,
		mentionerPersona?: string,
	): Promise<IterationResult> {
		console.log(
			`Product/Architect handling mention from ${mentioner} in issue #${issueNumber}`,
		);

		const attribution = getAttribution(
			"Product/Architect",
			issueNumber,
			mentioner,
			commentUrl,
			mentionerPersona,
		);
		const fullContext = await this.github.getFullIssueContext(
			owner,
			repo,
			issueNumber,
		);
		const initialMessage = `${attribution}\nThe Overseer has tasked you with a micro-task: ${body}\n\nPlease proceed with defining the requirements/design in the repository.`;

		return this.runner.runAutonomousLoop(
			this.gemini,
			ProductArchitectPersona.SYSTEM_INSTRUCTION,
			`${initialMessage}\n\nCONTEXT:\n${fullContext}`,
		);
	}
}
