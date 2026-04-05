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

export function extractQuotedCorrectionMentions(text: string): string[] {
	const matches = text.matchAll(/`([^`\n]+)`/g);
	const mentions = new Set<string>();
	for (const match of matches) {
		const value = match[1]?.trim();
		if (!value || /^(?:src|prompts|docs)\//.test(value)) {
			continue;
		}
		if (value === "bots.json" || value === "AGENTS.md") {
			continue;
		}
		mentions.add(value);
	}
	return [...mentions];
}

export function extractDesignDocPath(text: string): string | null {
	const match = text.match(
		/(?:^|[`(\s])((?:docs\/(?:design|architecture)\/[A-Za-z0-9_./-]+\.md))(?=$|[`),.\s])/i,
	);
	return match?.[1]?.trim() || null;
}

function normalizeHumanCorrection(body: string): string {
	return body.replace(/^@overseer\b\s*/i, "").trim();
}

function shouldDirectRouteDesignRepair(
	body: string,
	commenterPersona: string | undefined,
	explicitRepoPaths: string[],
	explicitCorrectionMentions: string[],
): boolean {
	if (commenterPersona) {
		return false;
	}
	return (
		/design/i.test(body) &&
		/(do not approve|still do not approve|retry the design repair|revise the design)/i.test(
			body,
		) &&
		(explicitRepoPaths.length > 0 || explicitCorrectionMentions.length > 0)
	);
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

	private buildDirectDesignRepairResponse(
		body: string,
		fullContext: string,
		explicitRepoPaths: string[],
		explicitCorrectionMentions: string[],
	): IterationResult {
		const designFile =
			extractDesignDocPath(body) || extractDesignDocPath(fullContext);
		const filesToRead = Array.from(
			new Set(
				[designFile, ...explicitRepoPaths].filter((value): value is string =>
					Boolean(value),
				),
			),
		);
		const correction = normalizeHumanCorrection(body);
		const currentStep = designFile
			? `Revise ${designFile} so it explicitly incorporates the latest human correction, including ${explicitCorrectionMentions.join(", ") || "the named repository seams"}, and matches the current repository files.`
			: `Revise the active design doc so it explicitly incorporates the latest human correction, including ${explicitCorrectionMentions.join(", ") || "the named repository seams"}, and matches the current repository files.`;
		const doneWhen = designFile
			? `${designFile} explicitly covers the latest human correction, matches the named prompt/config/protocol/runtime seams from the repository, and is ready for human approval.`
			: `The active design doc explicitly covers the latest human correction, matches the named prompt/config/protocol/runtime seams from the repository, and is ready for human approval.`;
		const lines = [
			"The human has provided a concrete design correction. I am routing that correction directly back to the Product/Architect without paraphrasing it away.",
			"",
			"Architect Task:",
			"Task ID: MVP validation: persist_qa end-to-end",
			`Design File: ${designFile || "none"}`,
			"Design Approval Status: needs_revision",
			"Files To Read:",
			...(filesToRead.length > 0
				? filesToRead.map((path) => `- ${path}`)
				: ["- none"]),
			`Current Step: ${currentStep}`,
			`Task Summary: Rewrite the stale design sections so they match this human correction literally where relevant: ${correction}`,
			`Done When: ${doneWhen}`,
			"Verification:",
			...(designFile ? [`- cat ${designFile}`] : ["- cat docs/design"]),
			"Likely Next Step: human approval",
		];

		return {
			finalResponse: lines.join("\n"),
			handoffTo: "@product-architect",
			log: `DIRECT DESIGN REPAIR ROUTE\n\n${lines.join("\n")}`,
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

		const explicitRepoPaths = extractRepoPathMentions(body);
		const explicitCorrectionMentions = extractQuotedCorrectionMentions(body);
		const latestResponder =
			_commenterPersona || commenter || "unknown responder";
		if (
			shouldDirectRouteDesignRepair(
				body,
				_commenterPersona,
				explicitRepoPaths,
				explicitCorrectionMentions,
			)
		) {
			const directRouteContext = extractDesignDocPath(body)
				? body
				: await this.github.getFullIssueContext(owner, repo, issueNumber);
			logTrace("persona.overseer.directDesignRepairRoute", {
				commenter,
				commenterPersona: _commenterPersona,
				body: textStats(body),
				explicitRepoPaths,
				explicitCorrectionMentions,
			});
			return this.buildDirectDesignRepairResponse(
				body,
				directRouteContext,
				explicitRepoPaths,
				explicitCorrectionMentions,
			);
		}
		const fullContext = await this.github.getFullIssueContext(
			owner,
			repo,
			issueNumber,
		);
		const retryingSameSpecialistIsAllowed =
			/(ERROR:\s*Max iterations reached|Blocker:|failed to|does not exist|needs revision|needs repair)/i.test(
				body,
			);
		const sameResponderGuardrail = retryingSameSpecialistIsAllowed
			? `- Do not assign the next step back to ${latestResponder} unless the latest response is a blocker, timeout, or repair request that still belongs with that specialist after you fix the task packet.`
			: `- Do not assign the next step back to ${latestResponder}.`;
		const explicitRepoPathsSection =
			explicitRepoPaths.length > 0
				? `\nExplicit repo paths mentioned in the latest comment:\n${explicitRepoPaths
						.map((path) => `- ${path}`)
						.join(
							"\n",
						)}\n- Preserve these paths in the next handoff when they are relevant to the correction or blocker.`
				: "";
		const explicitCorrectionMentionsSection =
			explicitCorrectionMentions.length > 0
				? `\nExplicit quoted constraints from the latest comment:\n${explicitCorrectionMentions
						.map((value) => `- ${value}`)
						.join(
							"\n",
						)}\n- Preserve these quoted constraints in the next handoff's Current Step, Task Summary, Files To Read, or Done When when they are relevant to the correction or blocker.`
				: "";
		const taskBody = `The issue has been updated. The latest response came from ${latestResponder}. Review the full context and decide the next micro-task.

Guardrails:
${sameResponderGuardrail}
- If ${latestResponder} claims to have created or updated files, read those files before deciding the next action.
- If the latest comment names specific repository files or corrects the execution seam, preserve those corrections in the next handoff's Files To Read and Current Step instead of falling back to generic related files.
- If the latest comment gives explicit capability, action, prompt, or bot-role corrections, preserve those corrections in the next handoff instead of collapsing them into a partial summary.${explicitRepoPathsSection}${explicitCorrectionMentionsSection}

LATEST COMMENT TO PRESERVE LITERALLY WHEN RELEVANT:
${body}

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
