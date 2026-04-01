import type { AgentRunner, IterationResult } from "../utils/agent_runner.js";
import { AgentRunner as AgentRunnerClass } from "../utils/agent_runner.js";
import type { GeminiService } from "../utils/gemini.js";
import type { GitHubService } from "../utils/github.js";
import { logTrace, textStats } from "../utils/trace.js";

export class PlannerPersona {
	private gemini: GeminiService;
	private github: GitHubService;
	private runner: AgentRunner;

	static readonly SYSTEM_INSTRUCTION = `
You are the Planner, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to break down designs into actionable micro-tasks.

AUTONOMOUS RULES:
1. **Internal Iteration:** Use [RUN:command] to explore the repository and verify the feasibility of your plan.
2. **Repo-Centric Communication:** Write detailed plans, checklists, or task breakdowns directly to files in the repository (e.g., in docs/plans/).
3. **Conciseness:** Your final response must be a maximum 3-sentence summary of the planning work you completed and the files you created.
4. **Handoff:** You do not delegate. Provide your summary and the Dispatcher will return control to the Overseer.

You are authorized to modify files using standard Unix tools via [RUN:command].
    `;

	constructor(gemini: GeminiService, github: GitHubService) {
		this.gemini = gemini;
		this.github = github;
		this.runner = new AgentRunnerClass();
	}

	async handleMention(
		owner: string,
		repo: string,
		issueNumber: number,
		mentioner: string,
		body: string,
		_commentUrl?: string,
		_mentionerPersona?: string,
	): Promise<IterationResult> {
		console.log(
			`Planner handling mention from ${mentioner} in issue #${issueNumber}`,
		);

		const fullContext = await this.github.getFullIssueContext(
			owner,
			repo,
			issueNumber,
		);
		const initialMessage = `The Overseer has tasked you with planning a design: ${body}\n\nPlease proceed with breaking this down into micro-tasks in the repository.`;
		logTrace("persona.planner.promptPrepared", {
			mentioner,
			body: textStats(body),
			initialMessage: textStats(initialMessage),
			fullContext: textStats(fullContext),
			combinedInput: textStats(`${initialMessage}\n\nCONTEXT:\n${fullContext}`),
		});

		return this.runner.runAutonomousLoop(
			this.gemini,
			PlannerPersona.SYSTEM_INSTRUCTION,
			`${initialMessage}\n\nCONTEXT:\n${fullContext}`,
		);
	}
}
