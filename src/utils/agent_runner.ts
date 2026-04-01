import type { GeminiService } from "./gemini.js";
import { ShellService } from "./shell.js";
import { logTrace, textStats } from "./trace.js";

export interface IterationResult {
	finalResponse: string;
	log: string;
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
			const responseText = result.response.text();
			logTrace("agent.iteration.response", {
				iteration,
				durationMs: Date.now() - sendStartedAt,
				response: textStats(responseText),
				responseIsEmpty: responseText.trim().length === 0,
			});

			this.log(`AGENT RESPONSE: ${responseText}\n`);

			// Check for shell commands
			const shellOutput = await this.shell.executeAllBlocks(responseText);
			logTrace("agent.iteration.shell", {
				iteration,
				hadShellOutput: Boolean(shellOutput),
				shellOutput: textStats(shellOutput),
			});
			if (shellOutput) {
				this.log(`SHELL OUTPUT: ${shellOutput}\n`);
				currentMessage = `SHELL OUTPUT:\n${shellOutput}\n\nPlease analyze the results and continue your task. If you are finished, provide your final concise summary.`;
			} else {
				// No more commands, assume the agent is finished
				return {
					finalResponse: responseText,
					log: this.sessionLog,
				};
			}
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
}
