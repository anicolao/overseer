import type { AgentRunner, IterationResult } from "../utils/agent_runner.js";
import { AgentRunner as AgentRunnerClass } from "../utils/agent_runner.js";
import type { GeminiService } from "../utils/gemini.js";
import type { GitHubService } from "../utils/github.js";
import { isLimitReached } from "../utils/persona_helper.js";

export class OverseerPersona {
	private gemini: GeminiService;
	private github: GitHubService;
	private runner: AgentRunner;

	static readonly SYSTEM_INSTRUCTION = `
You are the Overseer, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to orchestrate a team of AI agent personas.

ORCHESTRATION RULES:
1. **Strict Boundary:** You are forbidden from writing implementation code or documentation directly to the repository. You act as a reviewer and orchestrator only.
2. **Micro-Tasking:** Never give an agent a multi-step checklist. Task them with EXACTLY ONE bite-sized sub-task at a time.
3. **Internal Iteration:** You can execute shell commands [RUN:command] to inspect the repository, verify file existence, or check project state before making a decision.
4. **Conciseness:** Your final response must be a maximum 3-sentence summary of your assessment, followed by the mandatory delegation suffix.

DELEGATION SUFFIX:
- YOU MUST end every output with: "Next step: @persona to take action" (e.g., "Next step: @planner to take action").
- If waiting for a human, end with: "Next step: human review required".

Current Personas:
- @product-architect: Requirements and High-level Design (Authorized to write files).
- @planner: Task decomposition (Authorized to write files/plans).
- @developer-tester: Code implementation and testing (Authorized to write files).
- @quality: Verification and review (Reviewer only, NO file writing).
    `;

	constructor(gemini: GeminiService, github: GitHubService) {
		this.gemini = gemini;
		this.github = github;
		this.runner = new AgentRunnerClass();
	}

	async handleNewIssue(
		owner: string,
		repo: string,
		issueNumber: number,
		title: string,
		body: string,
	): Promise<IterationResult> {
		console.log(`Overseer handling new issue #${issueNumber}: ${title}`);

		if (
			await isLimitReached(
				this.github,
				owner,
				repo,
				issueNumber,
				"Overseer",
				"@overseer",
				body,
			)
		) {
			return { finalResponse: "", log: "Limit reached" };
		}

		const initialMessage =
			"A new vision has been proposed. Please review the repository state and initiate the first micro-task.";

		return this.runner.runAutonomousLoop(
			this.gemini,
			OverseerPersona.SYSTEM_INSTRUCTION,
			initialMessage,
		);
	}

	async handleComment(
		owner: string,
		repo: string,
		issueNumber: number,
		commenter: string,
		body: string,
		_commentUrl?: string,
		_commenterPersona?: string,
	): Promise<IterationResult> {
		console.log(
			`Overseer handling comment from ${commenter} on issue #${issueNumber}`,
		);

		if (
			await isLimitReached(
				this.github,
				owner,
				repo,
				issueNumber,
				"Overseer",
				"@overseer",
				body,
			)
		) {
			return { finalResponse: "", log: "Limit reached" };
		}

		const fullContext = await this.github.getFullIssueContext(
			owner,
			repo,
			issueNumber,
		);
		const initialMessage =
			"The issue has been updated. Review the full context and decide the next micro-task.";

		return this.runner.runAutonomousLoop(
			this.gemini,
			OverseerPersona.SYSTEM_INSTRUCTION,
			`${initialMessage}\n\nCONTEXT:\n${fullContext}`,
		);
	}
}
