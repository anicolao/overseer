import { describe, expect, it } from "vitest";
import { AGENT_PROTOCOL_VERSION } from "./agent_protocol.js";
import { AgentRunner } from "./agent_runner.js";

describe("AgentRunner", () => {
	it("executes structured shell actions and returns the final response", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect the repository root.", "Return control."],
				next_step: "Inspect the repository root.",
				actions: [
					{ type: "run_shell", command: "printf 'hello'" },
					{ type: "run_shell", command: "printf 'world'" },
				],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect the repository root.", "Return control."],
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
		expect(result.log).toContain("world");
		expect(result.log).toContain("PROTOCOL RESPONSE");
	});

	it("executes persist_work actions through the injected callback", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Persist the prepared file.", "Return control."],
				next_step: "Persist the prepared file.",
				actions: [{ type: "persist_work" }],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Persist the prepared file.", "Return control."],
				next_step: "Return control to the dispatcher.",
				actions: [],
				task_status: "done",
				final_response:
					"Persisted the plan and verified it on the issue branch.",
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
			{
				persistWork: async () => ({
					ok: true,
					branch: "bot/issue-35",
					commit_sha: "abc123",
					changed_files: ["docs/plans/v2-implementation-plan.md"],
					message: "Persisted successfully.",
				}),
			},
		);

		expect(result.finalResponse).toContain("Persisted the plan");
		expect(result.log).toContain('"commit_sha": "abc123"');
	});

	it("posts optional github_comment updates during the loop", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect WORKFLOW.md.", "Return control."],
				next_step: "Inspect WORKFLOW.md.",
				actions: [{ type: "run_shell", command: "printf 'ok'" }],
				task_status: "in_progress",
				github_comment: "Started work and am inspecting repository guidance.",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect WORKFLOW.md.", "Return control."],
				next_step: "Return control to the dispatcher.",
				actions: [],
				task_status: "done",
				final_response: "Completed the requested work.",
			}),
		];

		const postedComments: string[] = [];
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
			{
				appendGithubComment: async (markdown) => {
					postedComments.push(markdown);
				},
			},
		);

		expect(postedComments).toEqual([
			"Started work and am inspecting repository guidance.",
		]);
		expect(result.finalResponse).toBe("Completed the requested work.");
		expect(result.log).toContain("GITHUB COMMENT APPENDED");
	});
});
