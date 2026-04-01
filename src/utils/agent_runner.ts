import {
	buildContinuationMessage,
	buildProtocolRepairMessage,
	type ParsedAgentProtocolResponse,
	parseAgentProtocolResponse,
} from "./agent_protocol.js";
import type { GeminiService } from "./gemini.js";
import type { PersistWorkResult } from "./persistence.js";
import { ShellService } from "./shell.js";
import { logTrace, textStats } from "./trace.js";

export interface IterationResult {
	finalResponse: string;
	log: string;
}

export interface AgentRunnerOptions {
	persistWork?: () => Promise<PersistWorkResult>;
}

export class AgentRunner {
	private shell: ShellService;
	private sessionLog: string = "";

	constructor() {
		this.shell = new ShellService();
	}

	async runAutonomousLoop(
		gemini: GeminiService,
		systemInstruction: string,
		initialMessage: string,
		maxIterations: number = 50,
		options: AgentRunnerOptions = {},
	): Promise<IterationResult> {
		logTrace("agent.loop.start", {
			maxIterations,
			systemInstruction: textStats(systemInstruction),
			initialMessage: textStats(initialMessage),
		});
		const chat = gemini.startChat(systemInstruction);
		let currentMessage = initialMessage;
		let iteration = 0;

		while (iteration < maxIterations) {
			iteration++;
			this.log(`\n=== ITERATION ${iteration} ===\n`);
			this.log(`AGENT INPUT: ${currentMessage}\n`);
			logTrace("agent.iteration.begin", {
				iteration,
				input: textStats(currentMessage),
			});

			const sendStartedAt = Date.now();
			const result = await chat.sendMessage(currentMessage);
			const responseText = result.text;
			logTrace("agent.iteration.response", {
				iteration,
				durationMs: Date.now() - sendStartedAt,
				response: textStats(responseText),
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
				taskStatus: parsedResponse.protocol.task_status,
				nextStep: parsedResponse.protocol.next_step,
				actionCount: parsedResponse.protocol.actions.length,
				finalResponse: textStats(parsedResponse.protocol.final_response || ""),
			});
			this.log(`PROTOCOL RESPONSE: ${parsedResponse.rawJson}\n`);

			if (parsedResponse.protocol.task_status === "done") {
				return {
					finalResponse: parsedResponse.protocol.final_response || "",
					log: this.sessionLog,
				};
			}

			const actionOutput = await this.executeAction(
				parsedResponse.protocol.actions[0],
				options,
			);
			logTrace("agent.iteration.action", {
				iteration,
				actionType: parsedResponse.protocol.actions[0]?.type,
				actionOutput: textStats(actionOutput),
			});
			this.log(`ACTION OUTPUT: ${actionOutput}\n`);
			currentMessage = buildContinuationMessage(actionOutput);
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

	private async executeAction(
		action:
			| ParsedAgentProtocolResponse["protocol"]["actions"][number]
			| undefined,
		options: AgentRunnerOptions,
	): Promise<string> {
		if (!action) {
			return "ERROR: No action was supplied.";
		}

		if (action.type === "run_shell") {
			return this.shell.executeActions([action]);
		}

		if (!options.persistWork) {
			return JSON.stringify(
				{
					ok: false,
					error_code: "persist_not_available",
					message:
						'persist_work is not available for this persona. Use "run_shell" instead.',
				},
				null,
				2,
			);
		}

		const result = await options.persistWork();
		return JSON.stringify(result, null, 2);
	}
}
