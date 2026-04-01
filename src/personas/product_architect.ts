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
import { extractDirectedTask } from "../utils/persona_helper.js";
import { logTrace, textStats } from "../utils/trace.js";

export class ProductArchitectPersona {
	private gemini: GeminiService;
	private persistence: PersistenceService;
	private runner: AgentRunner;

	static readonly SYSTEM_INSTRUCTION = `
You are the Product/Architect, an expert Linux developer operating in a Nix-based execution environment on GitHub Actions. Your job is to define requirements and high-level technical designs.

AUTONOMOUS RULES:
1. **Internal Iteration:** Use structured JSON actions to explore the codebase and verify your design before finalizing.
2. **Repository Guidance:** Before other work, if a top-level \`AGENTS.md\` exists, read and follow it.
3. **Repo-Centric Communication:** Write detailed requirements and architectural documents directly to files in the repository (e.g., in docs/architecture/).
4. **Persistence:** When your files are ready, call \`{"type":"persist_work"}\`. Do not run \`git commit\` or \`git push\` yourself. If persistence fails, inspect the reported error, fix what you can, and try again.
5. **Completion Gate:** You are not done when a local file exists. You are done only after \`persist_work\` succeeds and you verify with read-only git commands that \`origin/bot/issue-<n>\` contains the intended change.
6. **Conciseness:** Your final response must be a maximum 3-sentence summary of the files you created or updated. DO NOT include the full content of the documents in your final comment.
7. **Handoff:** You do not delegate. Simply provide your summary and the Dispatcher will return control to the Overseer.

You are authorized to modify files using shell commands emitted through the JSON action protocol.
${AGENT_PROTOCOL_PROMPT}
	`;

	constructor(
		gemini: GeminiService,
		_github: GitHubService,
		persistence: PersistenceService,
	) {
		this.gemini = gemini;
		this.persistence = persistence;
		this.runner = new AgentRunnerClass();
	}

	async handleMention(
		_owner: string,
		_repo: string,
		issueNumber: number,
		mentioner: string,
		body: string,
		_commentUrl?: string,
		_mentionerPersona?: string,
	): Promise<IterationResult> {
		console.log(
			`Product/Architect handling mention from ${mentioner} in issue #${issueNumber}`,
		);

		const directedTask = extractDirectedTask(body);
		const initialMessage = `The Overseer has tasked you with a micro-task: ${directedTask}

Target persistence branch: bot/issue-${issueNumber}

Please proceed with defining the requirements/design in the repository. Use persist_work when the changes are ready, and do not finish until you verify the remote issue branch contains your intended result.`;
		logTrace("persona.productArchitect.promptPrepared", {
			mentioner,
			body: textStats(body),
			directedTask: textStats(directedTask),
			initialMessage: textStats(initialMessage),
		});

		const runnerOptions: AgentRunnerOptions = {
			persistWork: () =>
				this.persistence.persistWork(issueNumber, "product-architect"),
		};

		return this.runner.runAutonomousLoop(
			this.gemini,
			ProductArchitectPersona.SYSTEM_INSTRUCTION,
			initialMessage,
			50,
			runnerOptions,
		);
	}
}
