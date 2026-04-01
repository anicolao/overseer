import { describe, expect, it } from "vitest";
import { AGENT_PROTOCOL_VERSION } from "./agent_protocol.js";
import { AgentRunner } from "./agent_runner.js";

describe("AgentRunner", () => {
	it("executes structured shell actions and returns the final response", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				next_step: "Inspect the repository root.",
				actions: [{ type: "run_shell", command: "printf 'hello'" }],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				next_step: "Return control to the dispatcher.",
				actions: [],
				task_status: "done",
				final_response: "Verified the repository root and completed the task.",
			}),
		];

		const gemini = {
			startChat() {
				return {
					async sendMessage() {
						const next = responses.shift();
						if (!next) {
							throw new Error("No more responses queued");
						}
						return { text: next, response: { text: () => next } };
					},
				};
			},
		};

		const runner = new AgentRunner();
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			5,
		);

		expect(result.finalResponse).toBe(
			"Verified the repository root and completed the task.",
		);
		expect(result.log).toContain("hello");
		expect(result.log).toContain("PROTOCOL RESPONSE");
	});
});
