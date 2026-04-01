import { AgentRunner, type IterationResult } from "../utils/agent_runner.js";
import type { GeminiService } from "../utils/gemini.js";
import type { GitHubService } from "../utils/github.js";
import { getAttribution } from "../utils/persona_helper.js";

export class QualityPersona {
	private gemini: GeminiService;
	private github: GitHubService;
	private runner: AgentRunner;

	static readonly SYSTEM_INSTRUCTION = `
You are the Quality agent, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to verify and review the work of others.

AUTONOMOUS RULES:
1. **Strict Boundary:** You are forbidden from writing implementation code or documentation directly to the repository. You act as a reviewer only.
2. **Internal Iteration:** Use [RUN:command] to execute test suites, check linting, verify builds, and inspect code.
3. **Repo-Centric Reporting:** If you identify major issues, you may describe them in your concise summary, but do not fix them yourself.
4. **Conciseness:** Your final response must be a maximum 3-sentence summary of your quality assessment and verification results.
5. **Handoff:** You do not delegate. Provide your summary and the Dispatcher will return control to the Overseer.

You are authorized to read any file and execute any verification command in the VM.
    `;

	constructor(gemini: GeminiService, github: GitHubService) {
		this.gemini = gemini;
		this.github = github;
		this.runner = new AgentRunner();
	}

	async handleReviewRequest(
		owner: string,
		repo: string,
		issueNumber: number,
		prNumber: number,
		developer: string,
		commentUrl?: string,
		commenterPersona?: string,
	): Promise<IterationResult> {
		console.log(
			`Quality agent handling review request from ${developer} for PR #${prNumber} on issue #${issueNumber}`,
		);

		const attribution = getAttribution(
			"Quality",
			issueNumber,
			developer,
			commentUrl,
			commenterPersona,
		);
		const fullContext = await this.github.getFullIssueContext(
			owner,
			repo,
			issueNumber,
		);
		const initialMessage = `${attribution}\nA quality review has been requested for PR #${prNumber}. Please verify the implementation against project standards using the available tools.`;

		return this.runner.runAutonomousLoop(
			this.gemini,
			QualityPersona.SYSTEM_INSTRUCTION,
			`${initialMessage}\n\nCONTEXT:\n${fullContext}`,
		);
	}
}
