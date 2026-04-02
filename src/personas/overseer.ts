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
import { getAttribution, isLimitReached } from "../utils/persona_helper.js";
import { logTrace, textStats } from "../utils/trace.js";

export class OverseerPersona {
	private bot: LoadedBotDefinition;
	private gemini: GeminiService;
	private github: GitHubService;
	private runner: AgentRunner;

	constructor(
		bot: LoadedBotDefinition,
		gemini: GeminiService,
		github: GitHubService,
	) {
		this.bot = bot;
		this.gemini = gemini;
		this.github = github;
		this.runner = new AgentRunnerClass();
	}

	private buildRunnerOptions(
		owner: string,
		repo: string,
		issueNumber: number,
	): AgentRunnerOptions {
		return {
			requireDoneHandoff: true,
			modelName: this.bot.llm.model,
			shellAccess: this.bot.shellAccess,
			promptDefinition: {
				botId: this.bot.id,
				displayName: this.bot.displayName,
				llm: this.bot.llm,
				...summarizePromptAssembly(this.bot.prompt),
			},
			appendGithubComment: async (markdown: string) => {
				const body = `${getAttribution(this.bot.displayName, issueNumber)}${markdown}`;
				await this.github.addCommentToIssue(owner, repo, issueNumber, body);
			},
		};
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

		const taskBody = `ISSUE TITLE: ${title}\n\nISSUE BODY:\n${body || "No body provided."}`;
		logTrace("persona.overseer.newIssuePromptPrepared", {
			title: textStats(title),
			body: textStats(body),
			taskBody: textStats(taskBody),
			taskBodyRaw: taskBody,
			prompt: summarizePromptAssembly(this.bot.prompt),
		});

		return this.runner.runAutonomousLoop(
			this.gemini,
			this.bot.prompt.concatenatedPrompt,
			taskBody,
			this.bot.maxIterations,
			this.buildRunnerOptions(owner, repo, issueNumber),
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
		const latestResponder =
			_commenterPersona || commenter || "unknown responder";
		const taskBody = `The issue has been updated. The latest response came from ${latestResponder}. Review the full context and decide the next micro-task.

Guardrails:
- Do not assign the next step back to ${latestResponder}.
- If ${latestResponder} claims to have created or updated files, read those files before deciding the next action.

CONTEXT:
${fullContext}`;
		logTrace("persona.overseer.commentPromptPrepared", {
			commenter,
			commenterPersona: _commenterPersona,
			body: textStats(body),
			taskBody: textStats(taskBody),
			taskBodyRaw: taskBody,
			fullContext: textStats(fullContext),
			prompt: summarizePromptAssembly(this.bot.prompt),
		});

		return this.runner.runAutonomousLoop(
			this.gemini,
			this.bot.prompt.concatenatedPrompt,
			taskBody,
			this.bot.maxIterations,
			this.buildRunnerOptions(owner, repo, issueNumber),
		);
	}
}
