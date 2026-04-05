import type { LoadedBotDefinition } from "../bots/bot_config.js";
import { summarizePromptAssembly } from "../bots/bot_config.js";
import type {
	AgentRunner,
	AgentRunnerOptions,
	IterationResult,
} from "../utils/agent_runner.js";
import { AgentRunner as AgentRunnerClass } from "../utils/agent_runner.js";
import type { GeminiService } from "../utils/gemini.js";
import type { PersistenceService } from "../utils/persistence.js";
import {
	parseTaskPacket,
	renderTaskPacketForPrompt,
	validateTaskPacketForExecution,
} from "../utils/task_packet.js";
import { logTrace, textStats } from "../utils/trace.js";

export class TaskPersona {
	private bot: LoadedBotDefinition;
	private gemini: GeminiService;
	private persistence: PersistenceService;
	private runner: AgentRunner;

	constructor(
		bot: LoadedBotDefinition,
		gemini: GeminiService,
		persistence: PersistenceService,
	) {
		this.bot = bot;
		this.gemini = gemini;
		this.persistence = persistence;
		this.runner = new AgentRunnerClass();
	}

	async handleTask(
		_owner: string,
		_repo: string,
		issueNumber: number,
		taskBody: string,
	): Promise<IterationResult> {
		console.log(
			`${this.bot.displayName} handling task for issue #${issueNumber}`,
		);
		const taskPacket = parseTaskPacket(taskBody);
		const taskPacketValidation = validateTaskPacketForExecution(taskPacket);
		if (!taskPacketValidation.ok) {
			const finalResponse = [
				`Blocked before execution: ${taskPacketValidation.message}`,
				"",
				"Required next step: route this back to the architect or planner to repair the design/plan so it references real files and seams from the current repository.",
			].join("\n");
			const log = [
				"TASK PACKET PRECHECK FAILED",
				`Missing files: ${taskPacketValidation.missingFiles.join(", ")}`,
				`Raw body:\n${taskBody}`,
			].join("\n\n");
			logTrace("persona.task.precheckFailed", {
				botId: this.bot.id,
				displayName: this.bot.displayName,
				issueNumber,
				taskPacket,
				taskPacketValidation,
			});
			return {
				finalResponse,
				handoffTo: "@overseer",
				log,
			};
		}
		const canonicalTaskBody = renderTaskPacketForPrompt(taskPacket);
		const taskPromptBody = this.buildTaskPromptBody(
			taskPacket,
			canonicalTaskBody,
		);

		logTrace("persona.task.promptPrepared", {
			botId: this.bot.id,
			displayName: this.bot.displayName,
			issueNumber,
			taskBody: textStats(taskBody),
			taskBodyRaw: taskBody,
			taskPacket,
			canonicalTaskBody: textStats(taskPromptBody),
			canonicalTaskBodyRaw: taskPromptBody,
			shellAccess: this.bot.shellAccess,
			allowPersistWork: this.bot.allowPersistWork,
			allowPersistQa: this.bot.allowPersistQa,
			maxIterations: this.bot.maxIterations,
			maxActionsPerTurn: this.bot.maxActionsPerTurn,
			llm: this.bot.llm,
			prompt: summarizePromptAssembly(this.bot.prompt),
		});

		const runnerOptions: AgentRunnerOptions = {
			modelName: this.bot.llm.model,
			shellAccess: this.bot.shellAccess,
			maxActionsPerTurn: this.bot.maxActionsPerTurn,
			requirePostPersistVerification: this.bot.requirePostPersistVerification,
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
				? () => this.persistence.persistQa(issueNumber, this.bot.id)
				: undefined,
		};

		return this.runner.runAutonomousLoop(
			this.gemini,
			this.bot.prompt.concatenatedPrompt,
			taskPromptBody,
			this.bot.maxIterations,
			runnerOptions,
		);
	}

	private buildTaskPromptBody(
		taskPacket: ReturnType<typeof parseTaskPacket>,
		canonicalTaskBody: string,
	): string {
		if (
			taskPacket.handoffType === "architect" &&
			taskPacket.designApprovalStatus === "needs_revision"
		) {
			const artifact = taskPacket.designFile || "the design artifact";
			const hasQualityBotCorrection =
				taskPacket.humanCorrection?.includes("prompts/quality.md") ||
				taskPacket.humanCorrection?.includes("bots.json") ||
				taskPacket.humanCorrection?.includes("allowed_actions");
			return [
				"REPAIR EXECUTION NOTE:",
				"- This is a semantic design-repair task.",
				`- Treat the Human Correction field${taskPacket.humanCorrection ? " and the raw directed task" : ""} as a hard constraint, not as optional background context.`,
				"- The stale file names or abstractions may not appear verbatim in the current design doc.",
				`- After you inspect the named files once, rewrite the affected sections in ${artifact} so they name the real files, symbols, and seams from the current repository.`,
				"- Do not spend multiple turns searching for literal stale strings.",
				"- A no-op search or replace does not satisfy the task; you must leave a real diff in the design artifact or report a blocker.",
				...(hasQualityBotCorrection
					? [
							"- Before finishing, verify that the revised design explicitly covers all of these repository seams:",
							"  - prompt content in prompts/quality.md",
							"  - manifest/config in bots.json and src/bots/bot_config.ts",
							"  - protocol/schema in src/utils/agent_protocol.ts",
							"  - runtime execution in src/utils/agent_runner.ts",
							"  - runtime wiring in src/personas/task_persona.ts",
							"- Remove any claim that permissions are configured with allowed_actions unless that field exists in the current source.",
						]
					: []),
				"",
				canonicalTaskBody,
			].join("\n");
		}

		return canonicalTaskBody;
	}
}
