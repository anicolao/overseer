import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Content } from "@google/generative-ai";
import {
	type AgentHandoffTarget,
	buildContinuationMessage,
	buildLoopRepairMessage,
	buildProtocolRepairMessage,
	type ParsedAgentProtocolResponse,
	parseAgentProtocolResponse,
} from "./agent_protocol.js";
import type { GeminiService } from "./gemini.js";
import type { PersistWorkResult } from "./persistence.js";
import type { ShellExecutionMode } from "./shell.js";
import { ShellService } from "./shell.js";
import { logTrace, textStats } from "./trace.js";

export interface IterationResult {
	finalResponse: string;
	handoffTo?: AgentHandoffTarget;
	log: string;
	suppressFinalComment?: boolean;
}

export interface AgentRunnerOptions {
	persistWork?: () => Promise<PersistWorkResult>;
	persistQa?: () => Promise<PersistWorkResult>;
	requireDoneHandoff?: boolean;
	loopAbortHandoffTo?: AgentHandoffTarget;
	modelName?: string;
	shellAccess?: ShellExecutionMode;
	maxActionsPerTurn?: number;
	promptDefinition?: {
		botId: string;
		displayName: string;
		llm: {
			provider: string;
			model: string;
		};
		promptFiles: string[];
		promptFileContents: Record<
			string,
			{
				stats: ReturnType<typeof textStats>;
				content: string;
			}
		>;
		concatenatedPrompt: {
			stats: ReturnType<typeof textStats>;
			content: string;
		};
	};
}

interface ExecutedActionRecord {
	type: ParsedAgentProtocolResponse["protocol"]["actions"][number]["type"];
	command?: string;
	exitCode?: number;
	ok?: boolean;
	persistResult?: PersistWorkResult;
}

interface ActionExecutionResult {
	output: string;
	executedActions: ExecutedActionRecord[];
}

interface RunnerProgressState {
	usedRunShell: boolean;
	persistSucceededAfterWrite: boolean;
	verifiedAfterPersist: boolean;
	lastLoopFingerprint?: string;
	repeatedCycleCount: number;
	loopRepairsIssued: number;
}

export class AgentRunner {
	private shell: ShellService;
	private sessionLog: string = "";

	constructor(shell: ShellService = new ShellService()) {
		this.shell = shell;
	}

	async runAutonomousLoop(
		gemini: GeminiService,
		systemInstruction: string,
		initialMessage: string,
		maxIterations: number = 50,
		options: AgentRunnerOptions = {},
	): Promise<IterationResult> {
		const repositoryGuidance = this.loadRepositoryGuidance();
		logTrace("agent.loop.start", {
			maxIterations,
			modelName: options.modelName,
			systemInstruction: textStats(systemInstruction),
			systemInstructionRaw: systemInstruction,
			initialMessage: textStats(initialMessage),
			initialMessageRaw: initialMessage,
			promptDefinition: options.promptDefinition,
			repositoryGuidancePath: repositoryGuidance.path,
			repositoryGuidance: repositoryGuidance.content
				? textStats(repositoryGuidance.content)
				: undefined,
			repositoryGuidanceRaw: repositoryGuidance.content,
			repositoryGuidanceHistory: repositoryGuidance.history,
		});
		const chat = gemini.startChat(
			systemInstruction,
			repositoryGuidance.history,
			options.modelName,
		);
		const originalTask = initialMessage;
		let currentMessage = initialMessage;
		let iteration = 0;
		const progressState: RunnerProgressState = {
			usedRunShell: false,
			persistSucceededAfterWrite: false,
			verifiedAfterPersist: false,
			repeatedCycleCount: 0,
			loopRepairsIssued: 0,
		};

		while (iteration < maxIterations) {
			iteration++;
			this.log(`\n=== ITERATION ${iteration} ===\n`);
			this.log(`AGENT INPUT: ${currentMessage}\n`);
			logTrace("agent.iteration.begin", {
				iteration,
				input: textStats(currentMessage),
				inputRaw: currentMessage,
			});

			const sendStartedAt = Date.now();
			const result = await chat.sendMessage(currentMessage);
			const responseText = result.text;
			logTrace("agent.iteration.response", {
				iteration,
				durationMs: Date.now() - sendStartedAt,
				response: textStats(responseText),
				responseRaw: responseText,
				responseIsEmpty: responseText.trim().length === 0,
			});

			this.log(`AGENT RESPONSE: ${responseText}\n`);

			let parsedResponse: ParsedAgentProtocolResponse;
			try {
				parsedResponse = parseAgentProtocolResponse(responseText);
			} catch (error) {
				logTrace("agent.iteration.protocolError", {
					iteration,
					error: error instanceof Error ? error.message : String(error),
				});
				currentMessage = buildProtocolRepairMessage(
					error instanceof Error ? error.message : String(error),
					responseText,
				);
				continue;
			}

			logTrace("agent.iteration.protocol", {
				iteration,
				plan: parsedResponse.protocol.plan,
				taskStatus: parsedResponse.protocol.task_status,
				nextStep: parsedResponse.protocol.next_step,
				actionCount: parsedResponse.protocol.actions.length,
				githubComment: textStats(parsedResponse.protocol.github_comment || ""),
				githubCommentRaw: parsedResponse.protocol.github_comment || "",
				finalResponse: textStats(parsedResponse.protocol.final_response || ""),
				finalResponseRaw: parsedResponse.protocol.final_response || "",
				handoffTo: parsedResponse.protocol.handoff_to,
			});
			this.log(`PROTOCOL RESPONSE: ${parsedResponse.rawJson}\n`);

			const maxActionsPerTurn = options.maxActionsPerTurn ?? 1;
			if (parsedResponse.protocol.actions.length > maxActionsPerTurn) {
				const error = `actions may contain at most ${maxActionsPerTurn} item(s) for this persona, but you returned ${parsedResponse.protocol.actions.length}`;
				logTrace("agent.iteration.protocolError", {
					iteration,
					error,
					maxActionsPerTurn,
				});
				currentMessage = buildProtocolRepairMessage(error, responseText);
				continue;
			}

			if (parsedResponse.protocol.task_status === "done") {
				if (options.requireDoneHandoff && !parsedResponse.protocol.handoff_to) {
					const error =
						'task_status "done" requires a non-empty handoff_to for this persona';
					logTrace("agent.iteration.protocolError", {
						iteration,
						error,
					});
					currentMessage = buildProtocolRepairMessage(error, responseText);
					continue;
				}
				const doneValidationError = this.validateDoneResponse(progressState);
				if (doneValidationError) {
					logTrace("agent.iteration.protocolError", {
						iteration,
						error: doneValidationError,
					});
					currentMessage = buildProtocolRepairMessage(
						doneValidationError,
						responseText,
					);
					continue;
				}
				return {
					finalResponse: parsedResponse.protocol.final_response || "",
					handoffTo: parsedResponse.protocol.handoff_to,
					log: this.sessionLog,
				};
			}

			const actionExecution = await this.executeActions(
				parsedResponse.protocol.actions,
				options,
			);
			this.updateProgressState(progressState, actionExecution.executedActions);
			const actionOutput = actionExecution.output;
			logTrace("agent.iteration.action", {
				iteration,
				actionTypes: parsedResponse.protocol.actions.map(
					(action) => action.type,
				),
				actionOutput: textStats(actionOutput),
			});
			this.log(`ACTION OUTPUT: ${actionOutput}\n`);

			const loopFingerprint = this.buildLoopFingerprint(
				parsedResponse,
				actionExecution.executedActions,
			);
			if (loopFingerprint === progressState.lastLoopFingerprint) {
				progressState.repeatedCycleCount += 1;
			} else {
				progressState.lastLoopFingerprint = loopFingerprint;
				progressState.repeatedCycleCount = 0;
				progressState.loopRepairsIssued = 0;
			}

			if (progressState.repeatedCycleCount >= 1) {
				progressState.loopRepairsIssued += 1;
				if (progressState.loopRepairsIssued >= 3) {
					logTrace("agent.loop.abortedForRepeatedCycles", {
						iteration,
						repeatedCycleCount: progressState.repeatedCycleCount,
						loopRepairsIssued: progressState.loopRepairsIssued,
					});
					return {
						finalResponse:
							"Stopped after repeated no-progress loops. The bot needs a revised task packet or a different recovery approach before continuing.",
						handoffTo: options.loopAbortHandoffTo,
						log: this.sessionLog,
					};
				}

				currentMessage = buildLoopRepairMessage({
					originalTask,
					iteration,
					previousResponseJson: parsedResponse.rawJson,
					actionOutput,
					repeatedCycleCount: progressState.repeatedCycleCount + 1,
				});
				continue;
			}

			const reminder = this.buildProgressReminder(progressState);
			currentMessage = buildContinuationMessage({
				originalTask,
				iteration,
				previousResponseJson: parsedResponse.rawJson,
				previousGithubComment: parsedResponse.protocol.github_comment,
				actionOutput,
				reminder,
			});
		}

		logTrace("agent.loop.maxIterationsReached", {
			maxIterations,
		});
		return {
			finalResponse: "ERROR: Max iterations reached without completion.",
			log: this.sessionLog,
		};
	}

	private log(text: string) {
		this.sessionLog += text;
		console.log(text);
	}

	private async executeActions(
		actions: ParsedAgentProtocolResponse["protocol"]["actions"],
		options: AgentRunnerOptions,
	): Promise<ActionExecutionResult> {
		if (actions.length === 0) {
			return {
				output: "ERROR: No actions were supplied.",
				executedActions: [],
			};
		}

		const outputs: string[] = [];
		const executedActions: ExecutedActionRecord[] = [];
		const shellAccess = options.shellAccess ?? "read_write";

		for (const action of actions) {
			if (action.type === "run_ro_shell") {
				const result = await this.shell.executeCommand(
					action.command,
					"read_only",
				);
				executedActions.push({
					type: action.type,
					command: action.command,
					exitCode: result.exitCode,
					ok: result.exitCode === 0,
				});
				outputs.push(this.formatShellOutput(action.command, result));
				continue;
			}

			if (action.type === "run_shell") {
				if (shellAccess !== "read_write") {
					const denial = {
						ok: false,
						error_code: "run_shell_not_available",
						message:
							'run_shell is not available for this persona. Use "run_ro_shell" instead.',
					};
					executedActions.push({
						type: action.type,
						command: action.command,
						ok: false,
					});
					outputs.push(JSON.stringify(denial, null, 2));
					continue;
				}

				const result = await this.shell.executeCommand(
					action.command,
					"read_write",
				);
				executedActions.push({
					type: action.type,
					command: action.command,
					exitCode: result.exitCode,
					ok: result.exitCode === 0,
				});
				outputs.push(this.formatShellOutput(action.command, result));
				continue;
			}

			if (action.type === "persist_work") {
				if (!options.persistWork) {
					const denial = {
						ok: false,
						branch: "unavailable",
						error_code: "persist_not_available",
						message: "persist_work is not available for this persona.",
					};
					executedActions.push({
						type: action.type,
						ok: false,
						persistResult: denial,
					});
					outputs.push(JSON.stringify(denial, null, 2));
					continue;
				}

				const result = await options.persistWork();
				executedActions.push({
					type: action.type,
					ok: result.ok,
					persistResult: result,
				});
				outputs.push(JSON.stringify(result, null, 2));
				continue;
			}

			if (action.type === "persist_qa") {
				if (!options.persistQa) {
					const denial = {
						ok: false,
						branch: "unavailable",
						error_code: "persist_not_available",
						message: "persist_qa is not available for this persona.",
					};
					executedActions.push({
						type: action.type,
						ok: false,
						persistResult: denial,
					});
					outputs.push(JSON.stringify(denial, null, 2));
					continue;
				}

				const result = await options.persistQa();
				executedActions.push({
					type: action.type,
					ok: result.ok,
					persistResult: result,
				});
				outputs.push(JSON.stringify(result, null, 2));
				continue;
			}
		}

		return {
			output: outputs.join("\n"),
			executedActions,
		};
	}

	private formatShellOutput(
		command: string,
		result: Awaited<ReturnType<ShellService["executeCommand"]>>,
	): string {
		let output = `\n--- EXECUTING: ${command} ---\n`;
		if (result.stdout) {
			output += `STDOUT:\n${result.stdout}\n`;
		}
		if (result.stderr) {
			output += `STDERR:\n${result.stderr}\n`;
		}
		output += `EXIT CODE: ${result.exitCode}\n`;
		return output;
	}

	private updateProgressState(
		state: RunnerProgressState,
		executedActions: ExecutedActionRecord[],
	): void {
		for (const action of executedActions) {
			if (action.type === "run_shell" && action.ok) {
				state.usedRunShell = true;
				state.persistSucceededAfterWrite = false;
				state.verifiedAfterPersist = false;
				continue;
			}

			if (action.type === "persist_work") {
				if (state.usedRunShell && action.persistResult?.ok) {
					state.persistSucceededAfterWrite = true;
					state.verifiedAfterPersist = false;
				}
				continue;
			}

			if (
				action.type === "run_ro_shell" &&
				action.ok &&
				state.usedRunShell &&
				state.persistSucceededAfterWrite
			) {
				state.verifiedAfterPersist = true;
			}
		}
	}

	private validateDoneResponse(state: RunnerProgressState): string | null {
		if (!state.usedRunShell) {
			return null;
		}

		if (!state.persistSucceededAfterWrite) {
			return 'task_status "done" is not allowed after a successful run_shell action until persist_work or persist_qa succeeds';
		}

		if (!state.verifiedAfterPersist) {
			return 'task_status "done" is not allowed after persist_work or persist_qa until you verify the persisted branch state with run_ro_shell';
		}

		return null;
	}

	private buildProgressReminder(
		state: RunnerProgressState,
	): string | undefined {
		if (!state.usedRunShell) {
			return undefined;
		}
		if (!state.persistSucceededAfterWrite) {
			return "You have used run_shell successfully in this task. Do not finish until persist_work or persist_qa succeeds.";
		}
		if (!state.verifiedAfterPersist) {
			return "Persistence succeeded. Run a read-only verification against the persisted branch or file contents before finishing.";
		}
		return undefined;
	}

	private buildLoopFingerprint(
		parsedResponse: ParsedAgentProtocolResponse,
		executedActions: ExecutedActionRecord[],
	): string {
		const fingerprintPayload = {
			plan: parsedResponse.protocol.plan,
			nextStep: parsedResponse.protocol.next_step,
			actions: parsedResponse.protocol.actions,
			executedActions: executedActions.map((action) => ({
				type: action.type,
				command: action.command,
				exitCode: action.exitCode,
				ok: action.ok,
				persistOk: action.persistResult?.ok,
				persistErrorCode: action.persistResult?.error_code,
				persistMessage: action.persistResult?.message,
			})),
		};
		return createHash("sha256")
			.update(JSON.stringify(fingerprintPayload))
			.digest("hex");
	}

	private loadRepositoryGuidance(): {
		path?: string;
		content?: string;
		history: Content[];
	} {
		const agentsPath = resolve(process.cwd(), "AGENTS.md");
		if (!existsSync(agentsPath)) {
			return {
				history: [],
			};
		}

		const content = readFileSync(agentsPath, "utf8").trim();
		if (content.length === 0) {
			return {
				path: agentsPath,
				content,
				history: [],
			};
		}

		const userMessage = [
			"Repository guidance from the top-level AGENTS.md file.",
			"Follow this guidance for the rest of the task.",
			"",
			"AGENTS.md:",
			"",
			content,
		].join("\n");

		return {
			path: agentsPath,
			content,
			history: [
				{
					role: "user",
					parts: [{ text: userMessage }],
				},
				{
					role: "model",
					parts: [
						{
							text: "Understood. I will follow the repository guidance from AGENTS.md.",
						},
					],
				},
			],
		};
	}
}
