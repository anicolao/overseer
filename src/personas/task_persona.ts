import type { LoadedBotDefinition } from "../bots/bot_config.js";
import { summarizePromptAssembly } from "../bots/bot_config.js";
import type {
	AgentRunner,
	AgentRunnerOptions,
	IterationResult,
} from "../utils/agent_runner.js";
import { AgentRunner as AgentRunnerClass } from "../utils/agent_runner.js";
import type { GeminiService } from "../utils/gemini.js";
import type { GitHubService } from "../utils/github.js";
import type { PersistenceService } from "../utils/persistence.js";
import { getAttribution } from "../utils/persona_helper.js";
import { logTrace, textStats } from "../utils/trace.js";

export class TaskPersona {
	private bot: LoadedBotDefinition;
	private gemini: GeminiService;
	private github: GitHubService;
	private persistence: PersistenceService;
	private runner: AgentRunner;

	constructor(
		bot: LoadedBotDefinition,
		gemini: GeminiService,
		github: GitHubService,
		persistence: PersistenceService,
	) {
		this.bot = bot;
		this.gemini = gemini;
		this.github = github;
		this.persistence = persistence;
		this.runner = new AgentRunnerClass();
	}

	async handleTask(
		owner: string,
		repo: string,
		issueNumber: number,
		taskBody: string,
	): Promise<IterationResult> {
		console.log(
			`${this.bot.displayName} handling task for issue #${issueNumber}`,
		);

		logTrace("persona.task.promptPrepared", {
			botId: this.bot.id,
			displayName: this.bot.displayName,
			issueNumber,
			taskBody: textStats(taskBody),
			taskBodyRaw: taskBody,
			allowPersistWork: this.bot.allowPersistWork,
			maxIterations: this.bot.maxIterations,
			llm: this.bot.llm,
			prompt: summarizePromptAssembly(this.bot.prompt),
		});

		const runnerOptions: AgentRunnerOptions = {
			modelName: this.bot.llm.model,
			promptDefinition: {
				botId: this.bot.id,
				displayName: this.bot.displayName,
				llm: this.bot.llm,
				...summarizePromptAssembly(this.bot.prompt),
			},
			persistWork: this.bot.allowPersistWork
				? () => this.persistence.persistWork(issueNumber, this.bot.id)
				: undefined,
			persistQa: this.bot.allowPersistQa
				? () => this.persistence.persistWork(issueNumber, this.bot.id)
				: undefined,
			appendGithubComment: async (markdown: string) => {
				const body = `${getAttribution(this.bot.displayName, issueNumber)}${markdown}`;
				await this.github.addCommentToIssue(owner, repo, issueNumber, body);
			},
			requireDoneHandoff: this.bot.requireDoneHandoff,
		};

		return this.runner.runAutonomousLoop(
			this.gemini,
			this.bot.prompt.concatenatedPrompt,
			taskBody,
			this.bot.maxIterations,
			runnerOptions,
		);
	}
}
