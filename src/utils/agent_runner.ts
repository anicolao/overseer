import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Content } from "@google/generative-ai";
import {
	type AgentHandoffTarget,
	buildContinuationMessage,
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
	requireDoneHandoff?: boolean;
	modelName?: string;
	shellAccess?: ShellExecutionMode;
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
				return {
					finalResponse: parsedResponse.protocol.final_response || "",
					handoffTo: parsedResponse.protocol.handoff_to,
					log: this.sessionLog,
				};
			}

			const actionOutput = await this.executeActions(
				parsedResponse.protocol.actions,
				options,
			);
			logTrace("agent.iteration.action", {
				iteration,
				actionTypes: parsedResponse.protocol.actions.map(
					(action) => action.type,
				),
				actionOutput: textStats(actionOutput),
			});
			this.log(`ACTION OUTPUT: ${actionOutput}\n`);
			currentMessage = buildContinuationMessage({
				originalTask,
				iteration,
				previousResponseJson: parsedResponse.rawJson,
				previousGithubComment: parsedResponse.protocol.github_comment,
				actionOutput,
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
	): Promise<string> {
		if (actions.length === 0) {
			return "ERROR: No actions were supplied.";
		}

		const outputs: string[] = [];
		const shellAccess = options.shellAccess ?? "read_write";

		for (const action of actions) {
			if (action.type === "run_ro_shell") {
				outputs.push(await this.shell.executeActions([action]));
				continue;
			}

			if (action.type === "run_shell") {
				if (shellAccess !== "read_write") {
					outputs.push(
						JSON.stringify(
							{
								ok: false,
								error_code: "run_shell_not_available",
								message:
									'run_shell is not available for this persona. Use "run_ro_shell" instead.',
							},
							null,
							2,
						),
					);
					continue;
				}

				outputs.push(await this.shell.executeActions([action]));
				continue;
			}

			if (action.type === "persist_qa") {
				const normalizedPath = action.path.replace(/\\/g, "/");
				if (!normalizedPath.startsWith("docs/qa/")) {
					outputs.push(
						JSON.stringify(
							{
								ok: false,
								error_code: "invalid_path",
								message:
									"persist_qa only allowed for paths starting with docs/qa/",
							},
							null,
							2,
						),
					);
					continue;
				}

				try {
					const fullPath = resolve(process.cwd(), normalizedPath);
					const dir = dirname(fullPath);
					if (!existsSync(dir)) {
						mkdirSync(dir, { recursive: true });
					}
					writeFileSync(fullPath, action.content, "utf8");
					outputs.push(
						JSON.stringify(
							{
								ok: true,
								path: normalizedPath,
								message: `Successfully persisted QA documentation to ${normalizedPath}`,
							},
							null,
							2,
						),
					);
				} catch (error) {
					outputs.push(
						JSON.stringify(
							{
								ok: false,
								error_code: "write_failed",
								message: `Failed to write QA documentation: ${error instanceof Error ? error.message : String(error)}`,
							},
							null,
							2,
						),
					);
				}
				continue;
			}

			if (!options.persistWork) {
				outputs.push(
					JSON.stringify(
						{
							ok: false,
							error_code: "persist_not_available",
							message: "persist_work is not available for this persona.",
						},
						null,
						2,
					),
				);
				continue;
			}

			const result = await options.persistWork();
			outputs.push(JSON.stringify(result, null, 2));
		}

		return outputs.join("\n");
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
