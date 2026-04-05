import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
	requirePostPersistVerification?: boolean;
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
	path?: string;
	exitCode?: number;
	ok?: boolean;
	persistResult?: PersistWorkResult;
	message?: string;
}

interface ActionExecutionResult {
	output: string;
	summary: string;
	executedActions: ExecutedActionRecord[];
}

interface RunnerProgressState {
	usedWriteAction: boolean;
	persistSucceededAfterWrite: boolean;
	verifiedAfterPersist: boolean;
	lastLoopFingerprint?: string;
	repeatedCycleCount: number;
	loopRepairsIssued: number;
	consecutiveReadOnlyTurnsWithoutWrite: number;
	lastProtocolError?: string;
	consecutiveProtocolErrorCount: number;
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
			usedWriteAction: false,
			persistSucceededAfterWrite: false,
			verifiedAfterPersist: false,
			repeatedCycleCount: 0,
			loopRepairsIssued: 0,
			consecutiveReadOnlyTurnsWithoutWrite: 0,
			consecutiveProtocolErrorCount: 0,
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
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				logTrace("agent.iteration.protocolError", {
					iteration,
					error: errorMessage,
				});
				const abortResult = this.handleProtocolError(
					progressState,
					errorMessage,
					responseText,
					options,
				);
				if (abortResult) {
					return abortResult;
				}
				currentMessage = buildProtocolRepairMessage(errorMessage, responseText);
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
				const abortResult = this.handleProtocolError(
					progressState,
					error,
					responseText,
					options,
				);
				if (abortResult) {
					return abortResult;
				}
				currentMessage = buildProtocolRepairMessage(error, responseText);
				continue;
			}

			const readOnlyStallError = this.validateReadOnlyStallResponse(
				progressState,
				parsedResponse,
			);
			if (readOnlyStallError) {
				logTrace("agent.iteration.protocolError", {
					iteration,
					error: readOnlyStallError,
				});
				const abortResult = this.handleProtocolError(
					progressState,
					readOnlyStallError,
					responseText,
					options,
				);
				if (abortResult) {
					return abortResult;
				}
				currentMessage = buildProtocolRepairMessage(
					readOnlyStallError,
					responseText,
				);
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
					const abortResult = this.handleProtocolError(
						progressState,
						error,
						responseText,
						options,
					);
					if (abortResult) {
						return abortResult;
					}
					currentMessage = buildProtocolRepairMessage(error, responseText);
					continue;
				}
				const doneValidationError = this.validateDoneResponse(
					progressState,
					options.requirePostPersistVerification ?? true,
				);
				if (doneValidationError) {
					logTrace("agent.iteration.protocolError", {
						iteration,
						error: doneValidationError,
					});
					const abortResult = this.handleProtocolError(
						progressState,
						doneValidationError,
						responseText,
						options,
					);
					if (abortResult) {
						return abortResult;
					}
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
			progressState.lastProtocolError = undefined;
			progressState.consecutiveProtocolErrorCount = 0;
			this.updateProgressState(progressState, actionExecution.executedActions);
			const actionOutput = actionExecution.output;
			const actionSummary = actionExecution.summary;
			logTrace("agent.iteration.action", {
				iteration,
				actionTypes: parsedResponse.protocol.actions.map(
					(action) => action.type,
				),
				actionOutput: textStats(actionOutput),
				actionSummary: textStats(actionSummary),
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
					previousPlan: parsedResponse.protocol.plan,
					previousNextStep: parsedResponse.protocol.next_step,
					actionResultSummary: actionSummary,
					repeatedCycleCount: progressState.repeatedCycleCount + 1,
				});
				continue;
			}

			const reminder = this.buildProgressReminder(
				progressState,
				options.requirePostPersistVerification ?? true,
			);
			currentMessage = buildContinuationMessage({
				originalTask,
				iteration,
				previousPlan: parsedResponse.protocol.plan,
				previousNextStep: parsedResponse.protocol.next_step,
				previousGithubComment: parsedResponse.protocol.github_comment,
				actionResultSummary: actionSummary,
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
				summary: "No actions were supplied.",
				executedActions: [],
			};
		}

		const outputs: string[] = [];
		const summaries: string[] = [];
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
				const formatted = this.formatShellOutput(action.command, result);
				outputs.push(formatted);
				summaries.push(
					this.summarizeShellResult(action.command, result, "run_ro_shell"),
				);
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
						message: denial.message,
					});
					const formatted = JSON.stringify(denial, null, 2);
					outputs.push(formatted);
					summaries.push(
						`run_shell denied: ${denial.message} (error_code=${denial.error_code})`,
					);
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
				const formatted = this.formatShellOutput(action.command, result);
				outputs.push(formatted);
				summaries.push(
					this.summarizeShellResult(action.command, result, "run_shell"),
				);
				continue;
			}

			if (action.type === "replace_in_file") {
				if (shellAccess !== "read_write") {
					const denial = {
						ok: false,
						error_code: "replace_in_file_not_available",
						message:
							'replace_in_file is not available for this persona. Use "run_ro_shell" instead.',
						path: action.path,
					};
					executedActions.push({
						type: action.type,
						path: action.path,
						ok: false,
						message: denial.message,
					});
					const formatted = JSON.stringify(denial, null, 2);
					outputs.push(formatted);
					summaries.push(
						`replace_in_file denied for ${action.path}: ${denial.message} (error_code=${denial.error_code})`,
					);
					continue;
				}

				const result = this.executeReplaceInFile(action);
				executedActions.push({
					type: action.type,
					path: action.path,
					ok: result.ok,
					message: result.message,
				});
				const formatted = JSON.stringify(result, null, 2);
				outputs.push(formatted);
				summaries.push(
					result.ok
						? `replace_in_file updated ${action.path} (${result.replacements} replacement${result.replacements === 1 ? "" : "s"})`
						: `replace_in_file failed for ${action.path}: ${result.message} (error_code=${result.error_code})`,
				);
				continue;
			}

			if (action.type === "persist_qa") {
				if (!options.persistQa) {
					const denial = {
						ok: false,
						branch: "unavailable",
						error_code: "persist_qa_not_available",
						message: "persist_qa is not available for this persona.",
					};
					executedActions.push({
						type: action.type,
						ok: false,
						persistResult: denial,
						message: denial.message,
					});
					const formatted = JSON.stringify(denial, null, 2);
					outputs.push(formatted);
					summaries.push(
						`persist_qa unavailable: ${denial.message} (error_code=${denial.error_code})`,
					);
					continue;
				}

				const result = await options.persistQa();
				executedActions.push({
					type: action.type,
					ok: result.ok,
					persistResult: result,
					message: result.message,
				});
				const formatted = JSON.stringify(result, null, 2);
				outputs.push(formatted);
				summaries.push(this.summarizePersistResult(result));
				continue;
			}

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
					message: denial.message,
				});
				const formatted = JSON.stringify(denial, null, 2);
				outputs.push(formatted);
				summaries.push(
					`persist_work unavailable: ${denial.message} (error_code=${denial.error_code})`,
				);
				continue;
			}

			const result = await options.persistWork();
			executedActions.push({
				type: action.type,
				ok: result.ok,
				persistResult: result,
				message: result.message,
			});
			const formatted = JSON.stringify(result, null, 2);
			outputs.push(formatted);
			summaries.push(this.summarizePersistResult(result));
		}

		return {
			output: outputs.join("\n"),
			summary: summaries.join("\n"),
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
		const wroteThisTurn = executedActions.some(
			(action) =>
				(action.type === "run_shell" || action.type === "replace_in_file") &&
				action.ok,
		);
		const usedOnlyReadOnlyActions =
			executedActions.length > 0 &&
			executedActions.every(
				(action) => action.type === "run_ro_shell" && action.ok,
			);

		if (wroteThisTurn) {
			state.consecutiveReadOnlyTurnsWithoutWrite = 0;
		} else if (usedOnlyReadOnlyActions) {
			state.consecutiveReadOnlyTurnsWithoutWrite += 1;
		} else {
			state.consecutiveReadOnlyTurnsWithoutWrite = 0;
		}

		for (const action of executedActions) {
			if (
				(action.type === "run_shell" || action.type === "replace_in_file") &&
				action.ok
			) {
				state.usedWriteAction = true;
				state.persistSucceededAfterWrite = false;
				state.verifiedAfterPersist = false;
				continue;
			}

			if (action.type === "persist_work" || action.type === "persist_qa") {
				if (state.usedWriteAction && action.persistResult?.ok) {
					state.persistSucceededAfterWrite = true;
					state.verifiedAfterPersist = false;
				}
				continue;
			}

			if (
				action.type === "run_ro_shell" &&
				action.ok &&
				state.usedWriteAction &&
				state.persistSucceededAfterWrite
			) {
				state.verifiedAfterPersist = true;
			}
		}
	}

	private validateDoneResponse(
		state: RunnerProgressState,
		requirePostPersistVerification: boolean,
	): string | null {
		if (!state.usedWriteAction) {
			return null;
		}

		if (!state.persistSucceededAfterWrite) {
			return 'task_status "done" is not allowed after a successful repository write action until persist_work succeeds';
		}

		if (requirePostPersistVerification && !state.verifiedAfterPersist) {
			return 'task_status "done" is not allowed after persist_work until you verify the persisted branch state with run_ro_shell';
		}

		return null;
	}

	private handleProtocolError(
		state: RunnerProgressState,
		error: string,
		_responseText: string,
		options: AgentRunnerOptions,
	): IterationResult | null {
		if (state.lastProtocolError === error) {
			state.consecutiveProtocolErrorCount += 1;
		} else {
			state.lastProtocolError = error;
			state.consecutiveProtocolErrorCount = 1;
		}

		if (state.consecutiveProtocolErrorCount < 3) {
			return null;
		}

		logTrace("agent.loop.abortedForRepeatedProtocolErrors", {
			error,
			consecutiveProtocolErrorCount: state.consecutiveProtocolErrorCount,
		});
		return {
			finalResponse:
				"Stopped after repeated invalid responses without adapting. The bot needs a revised task packet or human intervention before continuing.",
			handoffTo: options.loopAbortHandoffTo,
			log: this.sessionLog,
		};
	}

	private validateReadOnlyStallResponse(
		state: RunnerProgressState,
		parsedResponse: ParsedAgentProtocolResponse,
	): string | null {
		if (state.usedWriteAction) {
			return null;
		}

		if (state.consecutiveReadOnlyTurnsWithoutWrite < 2) {
			return null;
		}

		if (parsedResponse.protocol.task_status === "done") {
			return null;
		}

		const hasOnlyReadOnlyActions =
			parsedResponse.protocol.actions.length > 0 &&
			parsedResponse.protocol.actions.every(
				(action) => action.type === "run_ro_shell",
			);
		if (!hasOnlyReadOnlyActions) {
			return null;
		}

		return `You have already spent ${state.consecutiveReadOnlyTurnsWithoutWrite} consecutive turns on read-only inspection without editing. Your next response must either make a targeted repository edit with replace_in_file or run_shell, or finish with task_status "done" and a blocker summary for Overseer.`;
	}

	private buildProgressReminder(
		state: RunnerProgressState,
		requirePostPersistVerification: boolean,
	): string | undefined {
		if (!state.usedWriteAction) {
			if (state.consecutiveReadOnlyTurnsWithoutWrite >= 2) {
				return `You have already spent ${state.consecutiveReadOnlyTurnsWithoutWrite} consecutive turns on read-only inspection without editing. Your next turn should make a targeted edit, run a focused verification, or return a blocker instead of rereading broad context.`;
			}
			return undefined;
		}
		if (!state.persistSucceededAfterWrite) {
			return "You have already modified repository files in this task. Do not finish until persist_work succeeds.";
		}
		if (requirePostPersistVerification && !state.verifiedAfterPersist) {
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
				path: action.path,
				exitCode: action.exitCode,
				ok: action.ok,
				message: action.message,
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

	private summarizeShellResult(
		command: string,
		result: Awaited<ReturnType<ShellService["executeCommand"]>>,
		actionType: "run_ro_shell" | "run_shell",
	): string {
		const parts = [
			`${actionType} \`${command}\` exited with code ${result.exitCode}.`,
		];
		const stdoutPreview = this.truncateForPrompt(result.stdout);
		if (stdoutPreview) {
			parts.push(`stdout preview: ${stdoutPreview}`);
		}
		const stderrPreview = this.truncateForPrompt(result.stderr);
		if (stderrPreview) {
			parts.push(`stderr preview: ${stderrPreview}`);
		}
		return parts.join("\n");
	}

	private summarizePersistResult(result: PersistWorkResult): string {
		if (result.ok) {
			const changedFiles =
				result.changed_files && result.changed_files.length > 0
					? result.changed_files.join(", ")
					: "none reported";
			return `persist_work succeeded on branch ${result.branch} at commit ${result.commit_sha}. Changed files: ${changedFiles}.`;
		}

		return `persist_work failed with error_code=${result.error_code}: ${result.message}`;
	}

	private truncateForPrompt(text: string, maxLength: number = 400): string {
		const normalized = text.trim().replace(/\s+/g, " ");
		if (normalized.length <= maxLength) {
			return normalized;
		}
		return `${normalized.slice(0, maxLength - 3)}...`;
	}

	private executeReplaceInFile(action: {
		path: string;
		old_string: string;
		new_string: string;
		replace_all?: boolean;
	}):
		| { ok: true; path: string; replacements: number; message: string }
		| {
				ok: false;
				path: string;
				error_code: string;
				message: string;
		  } {
		const repoRoot = resolve(process.cwd());
		const targetPath = resolve(repoRoot, action.path);
		if (!(targetPath === repoRoot || targetPath.startsWith(`${repoRoot}/`))) {
			return {
				ok: false,
				path: action.path,
				error_code: "path_outside_repo",
				message: "replace_in_file may only target files inside the repository.",
			};
		}

		if (!existsSync(targetPath)) {
			return {
				ok: false,
				path: action.path,
				error_code: "file_not_found",
				message: "Target file does not exist.",
			};
		}

		const original = readFileSync(targetPath, "utf8");
		const matchCount = original.split(action.old_string).length - 1;
		if (matchCount === 0) {
			return {
				ok: false,
				path: action.path,
				error_code: "old_string_not_found",
				message: "old_string was not found in the target file.",
			};
		}

		if (!action.replace_all && matchCount > 1) {
			return {
				ok: false,
				path: action.path,
				error_code: "ambiguous_match",
				message:
					"old_string matched multiple locations. Provide a more specific old_string or set replace_all to true.",
			};
		}

		const updated = action.replace_all
			? original.replaceAll(action.old_string, action.new_string)
			: original.replace(action.old_string, action.new_string);
		const replacements = action.replace_all ? matchCount : 1;
		writeFileSync(targetPath, updated, "utf8");
		return {
			ok: true,
			path: action.path,
			replacements,
			message: `Updated ${action.path} with ${replacements} replacement${replacements === 1 ? "" : "s"}.`,
		};
	}
}
