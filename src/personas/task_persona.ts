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

		logTrace("persona.task.promptPrepared", {
			botId: this.bot.id,
			displayName: this.bot.displayName,
			issueNumber,
			taskBody: textStats(taskBody),
			taskBodyRaw: taskBody,
			taskPacket,
			canonicalTaskBody: textStats(canonicalTaskBody),
			canonicalTaskBodyRaw: canonicalTaskBody,
			shellAccess: this.bot.shellAccess,
			allowPersistWork: this.bot.allowPersistWork,
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
		};

		return this.runner.runAutonomousLoop(
			this.gemini,
			this.bot.prompt.concatenatedPrompt,
			canonicalTaskBody,
			this.bot.maxIterations,
			runnerOptions,
		);
	}
}
