import { AGENT_PROTOCOL_PROMPT } from "../utils/agent_protocol.js";
import type {
	AgentRunner,
	AgentRunnerOptions,
	IterationResult,
} from "../utils/agent_runner.js";
import { AgentRunner as AgentRunnerClass } from "../utils/agent_runner.js";
import type { GeminiService } from "../utils/gemini.js";
import type { GitHubService } from "../utils/github.js";
import type { PersistenceService } from "../utils/persistence.js";
import { logTrace, textStats } from "../utils/trace.js";

export class DeveloperTesterPersona {
	private gemini: GeminiService;
	private github: GitHubService;
	private persistence: PersistenceService;
	private runner: AgentRunner;

	static readonly SYSTEM_INSTRUCTION = `
You are the Developer/Tester, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to implement code and functional tests.

AUTONOMOUS RULES:
1. **Plan-Act-Verify:** Use structured JSON actions to explore the codebase, apply changes, and then run verification commands (lint, test, build).
2. **Persistence:** When your changes are ready, call \`{"type":"persist_work"}\`. Do not run \`git commit\` or \`git push\` yourself. If persistence fails, inspect the reported error, fix what you can, and try again.
3. **Repo-Centric Communication:** Large amounts of technical detail should be in code comments or documentation files.
4. **Completion Gate:** You are not done when tests pass locally. You are done only after \`persist_work\` succeeds and you verify with read-only git commands that \`origin/bot/issue-<n>\` contains the intended change.
5. **Conciseness:** Your final response must be a maximum 3-sentence summary of the changes you implemented and the verification results.
6. **Handoff:** You do not delegate. Provide your summary and the Dispatcher will return control to the Overseer.

You are authorized to modify any file in the repository using shell commands emitted through the JSON action protocol.
${AGENT_PROTOCOL_PROMPT}
	`;

	constructor(
		gemini: GeminiService,
		github: GitHubService,
		persistence: PersistenceService,
	) {
		this.gemini = gemini;
		this.github = github;
		this.persistence = persistence;
		this.runner = new AgentRunnerClass();
	}

	async handleTask(
		owner: string,
		repo: string,
		issueNumber: number,
		taskDescription: string,
		_commentUrl?: string,
		_commenterPersona?: string,
	): Promise<IterationResult> {
		console.log(
			`Developer/Tester handling task for issue #${issueNumber}: ${taskDescription}`,
		);

		const fullContext = await this.github.getFullIssueContext(
			owner,
			repo,
			issueNumber,
		);
		const initialMessage = `The Overseer has tasked you with implementation: ${taskDescription}

Target persistence branch: bot/issue-${issueNumber}

Please proceed with the Plan-Act-Verify cycle in the repository. Use persist_work when the changes are ready, and do not finish until you verify the remote issue branch contains your intended result.`;
		logTrace("persona.developerTester.promptPrepared", {
			taskDescription: textStats(taskDescription),
			initialMessage: textStats(initialMessage),
			fullContext: textStats(fullContext),
			combinedInput: textStats(`${initialMessage}\n\nCONTEXT:\n${fullContext}`),
		});

		const runnerOptions: AgentRunnerOptions = {
			persistWork: () =>
				this.persistence.persistWork(issueNumber, "developer-tester"),
		};

		return this.runner.runAutonomousLoop(
			this.gemini,
			DeveloperTesterPersona.SYSTEM_INSTRUCTION,
			`${initialMessage}\n\nCONTEXT:\n${fullContext}`,
			50,
			runnerOptions,
		);
	}
}
