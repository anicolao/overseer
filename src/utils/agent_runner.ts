import { ChatSession } from '@google/generative-ai';
import { ShellService } from './shell.js';
import { GeminiService } from './gemini.js';

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
        maxIterations: number = 50
    ): Promise<IterationResult> {
        const chat = gemini.startChat(systemInstruction);
        let currentMessage = initialMessage;
        let iteration = 0;

        while (iteration < maxIterations) {
            iteration++;
            this.log(`\n=== ITERATION ${iteration} ===\n`);
            this.log(`AGENT INPUT: ${currentMessage}\n`);

            const result = await chat.sendMessage(currentMessage);
            const responseText = result.response.text();
            
            this.log(`AGENT RESPONSE: ${responseText}\n`);

            // Check for shell commands
            const shellOutput = await this.shell.executeAllBlocks(responseText);
            if (shellOutput) {
                this.log(`SHELL OUTPUT: ${shellOutput}\n`);
                currentMessage = `SHELL OUTPUT:\n${shellOutput}\n\nPlease analyze the results and continue your task. If you are finished, provide your final concise summary.`;
            } else {
                // No more commands, assume the agent is finished
                return {
                    finalResponse: responseText,
                    log: this.sessionLog
                };
            }
        }

        return {
            finalResponse: "ERROR: Max iterations reached without completion.",
            log: this.sessionLog
        };
    }

    private log(text: string) {
        this.sessionLog += text;
        console.log(text);
    }
}
