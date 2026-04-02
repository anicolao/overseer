import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Content } from "@google/generative-ai";
import {
	type AgentHandoffTarget,
	buildContinuationMessage,
	buildProtocolRepairMessage,
	type ParsedAgentProtocolResponse,
	parseAgentProtocolResponse,
} from "./agent_protocol.js";
import { prependStatusUpdateSentinel } from "./comment_markers.js";
import type { GeminiService } from "./gemini.js";
import type { PersistWorkResult } from "./persistence.js";
import { ShellService } from "./shell.js";
import { logTrace, textStats } from "./trace.js";

export interface IterationResult {
	finalResponse: string;
	handoffTo?: AgentHandoffTarget;
	log: string;
}

export interface AgentRunnerOptions {
	persistWork?: () => Promise<PersistWorkResult>;
	appendGithubComment?: (markdown: string) => Promise<void>;
	requireDoneHandoff?: boolean;
	modelName?: string;
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

			if (parsedResponse.protocol.github_comment) {
				await this.appendGithubComment(
					parsedResponse.protocol.github_comment,
					options,
					iteration,
				);
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

		for (const action of actions) {
			if (action.type === "run_shell") {
				outputs.push(await this.shell.executeActions([action]));
				continue;
			}

			if (!options.persistWork) {
				outputs.push(
					JSON.stringify(
						{
							ok: false,
							error_code: "persist_not_available",
							message:
								'persist_work is not available for this persona. Use "run_shell" instead.',
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

	private async appendGithubComment(
		markdown: string,
		options: AgentRunnerOptions,
		iteration: number,
	): Promise<void> {
		if (!options.appendGithubComment) {
			logTrace("agent.iteration.githubComment.skipped", {
				iteration,
				reason: "appendGithubComment not configured",
				githubComment: textStats(markdown),
				githubCommentRaw: markdown,
			});
			return;
		}

		const commentBody = prependStatusUpdateSentinel(markdown);
		await options.appendGithubComment(commentBody);
		logTrace("agent.iteration.githubComment.posted", {
			iteration,
			githubComment: textStats(markdown),
			githubCommentRaw: markdown,
			commentBody: textStats(commentBody),
			commentBodyRaw: commentBody,
		});
		this.log(`GITHUB COMMENT APPENDED: ${markdown}\n`);
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
