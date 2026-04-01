import { AGENT_PROTOCOL_PROMPT } from "../utils/agent_protocol.js";
import type { AgentRunner, IterationResult } from "../utils/agent_runner.js";
import { AgentRunner as AgentRunnerClass } from "../utils/agent_runner.js";
import type { GeminiService } from "../utils/gemini.js";
import type { GitHubService } from "../utils/github.js";
import { logTrace, textStats } from "../utils/trace.js";

export class QualityPersona {
	private gemini: GeminiService;
	private github: GitHubService;
	private runner: AgentRunner;

	static readonly SYSTEM_INSTRUCTION = `
You are the Quality agent, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to verify and review the work of others.

AUTONOMOUS RULES:
1. **Strict Boundary:** You are forbidden from writing implementation code or documentation directly to the repository. You act as a reviewer only.
2. **Internal Iteration:** Use structured JSON actions to execute test suites, check linting, verify builds, and inspect code.
3. **Repo-Centric Reporting:** If you identify major issues, you may describe them in your concise summary, but do not fix them yourself.
4. **Persistence Restriction:** You must never use \`persist_work\`. Use only read-only or verification shell commands.
5. **Conciseness:** Your final response must be a maximum 3-sentence summary of your quality assessment and verification results.
6. **Handoff:** You do not delegate. Provide your summary and the Dispatcher will return control to the Overseer.

You are authorized to read any file and execute any verification command in the VM.
${AGENT_PROTOCOL_PROMPT}
	`;

	constructor(gemini: GeminiService, github: GitHubService) {
		this.gemini = gemini;
		this.github = github;
		this.runner = new AgentRunnerClass();
	}

	async handleReviewRequest(
		owner: string,
		repo: string,
		issueNumber: number,
		prNumber: number,
		developer: string,
		_commentUrl?: string,
		_commenterPersona?: string,
	): Promise<IterationResult> {
		console.log(
			`Quality agent handling review request from ${developer} for PR #${prNumber} on issue #${issueNumber}`,
		);

		const fullContext = await this.github.getFullIssueContext(
			owner,
			repo,
			issueNumber,
		);
		const initialMessage = `A quality review has been requested for PR #${prNumber}. Please verify the implementation against project standards using the available tools.`;
		logTrace("persona.quality.promptPrepared", {
			developer,
			prNumber,
			initialMessage: textStats(initialMessage),
			fullContext: textStats(fullContext),
			combinedInput: textStats(`${initialMessage}\n\nCONTEXT:\n${fullContext}`),
		});

		return this.runner.runAutonomousLoop(
			this.gemini,
			QualityPersona.SYSTEM_INSTRUCTION,
			`${initialMessage}\n\nCONTEXT:\n${fullContext}`,
		);
	}
}
