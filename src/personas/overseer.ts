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
import { isLimitReached } from "../utils/persona_helper.js";
import { logTrace, textStats } from "../utils/trace.js";

export function extractRepoPathMentions(text: string): string[] {
	const matches = text.matchAll(
		/(?:^|[`(\s])((?:src|prompts|docs)\/[A-Za-z0-9_./-]+|bots\.json|AGENTS\.md)(?=$|[`),.\s])/g,
	);
	const paths = new Set<string>();
	for (const match of matches) {
		const path = match[1]?.trim();
		if (path) {
			paths.add(path);
		}
	}
	return [...paths];
}

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
		_owner: string,
		_repo: string,
		_issueNumber: number,
	): AgentRunnerOptions {
		return {
			requireDoneHandoff: true,
			loopAbortHandoffTo: "human_review_required",
			modelName: this.bot.llm.model,
			shellAccess: this.bot.shellAccess,
			maxActionsPerTurn: this.bot.maxActionsPerTurn,
			promptDefinition: {
				botId: this.bot.id,
				displayName: this.bot.displayName,
				llm: this.bot.llm,
				...summarizePromptAssembly(this.bot.prompt),
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
			return {
				finalResponse: "",
				log: "Limit reached",
				suppressFinalComment: true,
			};
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
			return {
				finalResponse: "",
				log: "Limit reached",
				suppressFinalComment: true,
			};
		}

		const fullContext = await this.github.getFullIssueContext(
			owner,
			repo,
			issueNumber,
		);
		const latestResponder =
			_commenterPersona || commenter || "unknown responder";
		const retryingSameSpecialistIsAllowed =
			/(ERROR:\s*Max iterations reached|Blocker:|failed to|does not exist|needs revision|needs repair)/i.test(
				body,
			);
		const sameResponderGuardrail = retryingSameSpecialistIsAllowed
			? `- Do not assign the next step back to ${latestResponder} unless the latest response is a blocker, timeout, or repair request that still belongs with that specialist after you fix the task packet.`
			: `- Do not assign the next step back to ${latestResponder}.`;
		const explicitRepoPaths = extractRepoPathMentions(body);
		const explicitRepoPathsSection =
			explicitRepoPaths.length > 0
				? `\nExplicit repo paths mentioned in the latest comment:\n${explicitRepoPaths
						.map((path) => `- ${path}`)
						.join(
							"\n",
						)}\n- Preserve these paths in the next handoff when they are relevant to the correction or blocker.`
				: "";
		const taskBody = `The issue has been updated. The latest response came from ${latestResponder}. Review the full context and decide the next micro-task.

Guardrails:
${sameResponderGuardrail}
- If ${latestResponder} claims to have created or updated files, read those files before deciding the next action.
- If the latest comment names specific repository files or corrects the execution seam, preserve those corrections in the next handoff's Files To Read and Current Step instead of falling back to generic related files.${explicitRepoPathsSection}

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
