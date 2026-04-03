import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentAction } from "./agent_protocol.js";
import { AGENT_PROTOCOL_VERSION } from "./agent_protocol.js";
import { AgentRunner } from "./agent_runner.js";
import type { ShellService } from "./shell.js";

describe("AgentRunner", () => {
	const makeFakeShell = (
		executeActions: (actions: AgentAction[]) => Promise<string>,
	): ShellService =>
		({
			async executeActions(actions: AgentAction[]) {
				return executeActions(actions);
			},
		}) as unknown as ShellService;

	it("executes structured shell actions and returns the final response", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect the repository root.", "Return control."],
				next_step: "Inspect the repository root.",
				actions: [
					{ type: "run_ro_shell", command: "printf 'hello'" },
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
		const sentMessages: string[] = [];

		const gemini = {
			startChat() {
				return {
					async sendMessage(message: string) {
						sentMessages.push(message);
						const next = responses.shift();
						if (!next) {
							throw new Error("No more responses queued");
						}
						return { text: next, response: { text: () => next } };
					},
				};
			},
		};

		const shell = makeFakeShell(async (actions) =>
			actions
				.filter(
					(
						action,
					): action is Extract<
						AgentAction,
						{ type: "run_shell" | "run_ro_shell" }
					> => action.type === "run_shell" || action.type === "run_ro_shell",
				)
				.map(
					(action) =>
						`\n--- EXECUTING: ${action.command} ---\nSTDOUT:\n${action.command.replace("printf ", "").replaceAll("'", "")}\nEXIT CODE: 0\n`,
				)
				.join(""),
		);

		const runner = new AgentRunner(shell);
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			5,
			{
				shellAccess: "read_write",
			},
		);

		expect(result.finalResponse).toBe(
			"Verified the repository root and completed the task.",
		);
		expect(result.handoffTo).toBeUndefined();
		expect(result.log).toContain("hello");
		expect(result.log).toContain("world");
		expect(result.log).toContain("[COMMAND: printf 'hello']");
		expect(result.log).toContain("[COMMAND: printf 'world']");
		expect(result.log).not.toContain("--- EXECUTING:");
		expect(result.log).not.toContain("STDOUT:");
		expect(result.log).not.toContain("EXIT CODE: 0");
		expect(result.log).toContain("PROTOCOL RESPONSE");
		expect(sentMessages).toHaveLength(2);
		expect(sentMessages[0]).toBe("Initial message");
		expect(sentMessages[1]).toContain("ORIGINAL TASK:");
		expect(sentMessages[1]).toContain("Initial message");
		expect(sentMessages[1]).toContain("CURRENT ITERATION: 1");
		expect(sentMessages[1]).toContain("MOST RECENT PLAN:");
		expect(sentMessages[1]).toContain("- Inspect the repository root.");
		expect(sentMessages[1]).toContain("MOST RECENT STRUCTURED RESPONSE:");
		expect(sentMessages[1]).toContain(
			'"next_step":"Inspect the repository root."',
		);
		expect(sentMessages[1]).toContain("LATEST ACTION OUTPUT:");
		expect(sentMessages[1]).toContain("hello");
		expect(sentMessages[1]).toContain("world");
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

		const runner = new AgentRunner(
			makeFakeShell(async () => {
				return "";
			}),
		);
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
		expect(result.handoffTo).toBeUndefined();
		expect(result.log).toContain("--- PERSIST WORK ---");
		expect(result.log).toContain('"commit_sha": "abc123"');
		expect(result.log).toContain("--- END PERSIST ---");
	});

	it("does not post github_comment status updates during the loop", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect WORKFLOW.md.", "Return control."],
				next_step: "Inspect WORKFLOW.md.",
				actions: [{ type: "run_ro_shell", command: "printf 'ok'" }],
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

		const shell = makeFakeShell(
			async () =>
				"\n--- EXECUTING: printf 'ok' ---\nSTDOUT:\nok\nEXIT CODE: 0\n",
		);
		const runner = new AgentRunner(shell);
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			5,
		);

		expect(postedComments).toEqual([]);
		expect(result.finalResponse).toBe("Completed the requested work.");
		expect(result.log).not.toContain("GITHUB COMMENT APPENDED");
	});

	it("rejects run_shell for read-only personas", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect files safely.", "Return control."],
				next_step: "Inspect files safely.",
				actions: [{ type: "run_shell", command: "printf 'nope' > file.txt" }],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect files safely.", "Return control."],
				next_step: "Return control to the dispatcher.",
				actions: [],
				task_status: "done",
				final_response: "Returned control after the rejected action.",
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

		const runner = new AgentRunner(makeFakeShell(async () => ""));
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			5,
			{
				shellAccess: "read_only",
			},
		);

		expect(result.log).toContain("run_shell_not_available");
		expect(result.finalResponse).toContain("Returned control");
	});

	it("requires a structured handoff when configured", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Hand off the work."],
				next_step: "Return control to the dispatcher.",
				actions: [],
				task_status: "done",
				final_response: "Delegating to planner.",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Hand off the work."],
				next_step: "Return control to the dispatcher.",
				actions: [],
				task_status: "done",
				handoff_to: "@planner",
				final_response: "Delegating to planner.",
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

		const runner = new AgentRunner(makeFakeShell(async () => ""));
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			5,
			{
				requireDoneHandoff: true,
			},
		);

		expect(result.handoffTo).toBe("@planner");
		expect(result.finalResponse).toBe("Delegating to planner.");
		expect(result.log).toContain("PROTOCOL RESPONSE");
	});

	it("injects top-level AGENTS.md into chat history before the task input", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "overseer-agent-runner-"));
		writeFileSync(
			join(tempDir, "AGENTS.md"),
			"# Repo Rules\nAlways read the plan first.\n",
		);

		const originalCwd = process.cwd();
		const capturedHistories: unknown[] = [];

		try {
			process.chdir(tempDir);

			const gemini = {
				startChat(_systemInstruction: string, history: unknown[]) {
					capturedHistories.push(history);
					return {
						async sendMessage() {
							const next = JSON.stringify({
								version: AGENT_PROTOCOL_VERSION,
								plan: ["Return control."],
								next_step: "Return control to the dispatcher.",
								actions: [],
								task_status: "done",
								final_response: "Completed the requested work.",
							});
							return { text: next, response: { text: () => next } };
						},
					};
				},
			};

			const runner = new AgentRunner(
				makeFakeShell(async () => {
					return "";
				}),
			);
			await runner.runAutonomousLoop(
				gemini as never,
				"System instruction",
				"Initial message",
				5,
			);
		} finally {
			process.chdir(originalCwd);
		}

		expect(capturedHistories).toHaveLength(1);
		expect(capturedHistories[0]).toEqual([
			{
				role: "user",
				parts: [
					{
						text: expect.stringContaining(
							"Repository guidance from the top-level AGENTS.md file.",
						),
					},
				],
			},
			{
				role: "model",
				parts: [
					{
						text: "Understood. I will follow the repository guidance from AGENTS.md.",
					},
				],
			},
		]);
		expect(
			(capturedHistories[0] as Array<{ parts: Array<{ text: string }> }>)[0]
				?.parts[0]?.text,
		).toContain("Always read the plan first.");
	});
});
