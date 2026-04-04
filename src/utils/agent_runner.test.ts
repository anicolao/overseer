import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_PROTOCOL_VERSION } from "./agent_protocol.js";
import { AgentRunner } from "./agent_runner.js";
import type { ShellService } from "./shell.js";

describe("AgentRunner", () => {
	const makeFakeShell = (
		executeCommand: (
			command: string,
			executionMode?: "read_only" | "read_write",
		) => Promise<{
			stdout: string;
			stderr: string;
			exitCode: number;
		}>,
	): ShellService =>
		({
			async executeCommand(
				command: string,
				executionMode?: "read_only" | "read_write",
			) {
				return executeCommand(command, executionMode);
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
					{ type: "run_ro_shell", command: "printf 'world'" },
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

		const shell = makeFakeShell(async (command) => ({
			stdout: command.replace("printf ", "").replaceAll("'", ""),
			stderr: "",
			exitCode: 0,
		}));

		const runner = new AgentRunner(shell);
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			5,
			{
				shellAccess: "read_write",
				maxActionsPerTurn: 2,
			},
		);

		expect(result.finalResponse).toBe(
			"Verified the repository root and completed the task.",
		);
		expect(result.handoffTo).toBeUndefined();
		expect(result.log).toContain("hello");
		expect(result.log).toContain("world");
		expect(result.log).toContain("PROTOCOL RESPONSE");
		expect(sentMessages).toHaveLength(2);
		expect(sentMessages[0]).toBe("Initial message");
		expect(sentMessages[1]).toContain("ORIGINAL TASK:");
		expect(sentMessages[1]).toContain("Initial message");
		expect(sentMessages[1]).toContain("CURRENT ITERATION: 1");
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
			makeFakeShell(async () => ({
				stdout: "",
				stderr: "",
				exitCode: 0,
			})),
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
		expect(result.log).toContain('"commit_sha": "abc123"');
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

		const shell = makeFakeShell(async () => ({
			stdout: "ok",
			stderr: "",
			exitCode: 0,
		}));
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

		const runner = new AgentRunner(
			makeFakeShell(async () => ({
				stdout: "",
				stderr: "",
				exitCode: 0,
			})),
		);
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

		const runner = new AgentRunner(
			makeFakeShell(async () => ({
				stdout: "",
				stderr: "",
				exitCode: 0,
			})),
		);
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
				makeFakeShell(async () => ({
					stdout: "",
					stderr: "",
					exitCode: 0,
				})),
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

	it("rejects done after run_shell until persistence and read-only verification succeed", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Edit the file.", "Return control."],
				next_step: "Edit the file.",
				actions: [{ type: "run_shell", command: "printf ok >> file.txt" }],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Edit the file.", "Return control."],
				next_step: "Return control.",
				actions: [],
				task_status: "done",
				final_response: "Finished locally.",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Persist the file.", "Verify the branch.", "Return control."],
				next_step: "Persist the file.",
				actions: [{ type: "persist_work" }],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Persist the file.", "Verify the branch.", "Return control."],
				next_step: "Verify the branch.",
				actions: [
					{
						type: "run_ro_shell",
						command: "git show origin/bot/issue-35:file.txt",
					},
				],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Persist the file.", "Verify the branch.", "Return control."],
				next_step: "Return control.",
				actions: [],
				task_status: "done",
				final_response: "Persisted and verified the change.",
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

		const runner = new AgentRunner(
			makeFakeShell(async (_command, executionMode) => ({
				stdout:
					executionMode === "read_only"
						? "persisted contents"
						: "local write ok",
				stderr: "",
				exitCode: 0,
			})),
		);
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			8,
			{
				shellAccess: "read_write",
				maxActionsPerTurn: 1,
				persistWork: async () => ({
					ok: true,
					branch: "bot/issue-35",
					commit_sha: "abc123",
					changed_files: ["file.txt"],
					message: "Persisted successfully.",
				}),
			},
		);

		expect(result.finalResponse).toBe("Persisted and verified the change.");
		expect(sentMessages[2]).toContain('task_status "done" is not allowed');
		expect(sentMessages[3]).toContain(
			"Persistence succeeded. Run a read-only verification",
		);
	});

	it("allows done after persist_work without read-only verification when configured", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Edit the file.", "Persist the file.", "Return control."],
				next_step: "Edit the file.",
				actions: [{ type: "run_shell", command: "printf ok >> file.txt" }],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Edit the file.", "Persist the file.", "Return control."],
				next_step: "Persist the file.",
				actions: [{ type: "persist_work" }],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Edit the file.", "Persist the file.", "Return control."],
				next_step: "Return control.",
				actions: [],
				task_status: "done",
				final_response: "Persisted the change and handed back to Overseer.",
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

		const runner = new AgentRunner(
			makeFakeShell(async () => ({
				stdout: "ok",
				stderr: "",
				exitCode: 0,
			})),
		);
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			6,
			{
				shellAccess: "read_write",
				maxActionsPerTurn: 1,
				requirePostPersistVerification: false,
				persistWork: async () => ({
					ok: true,
					branch: "bot/issue-35",
					commit_sha: "abc123",
					changed_files: ["file.txt"],
					message: "Persisted successfully.",
				}),
			},
		);

		expect(result.finalResponse).toBe(
			"Persisted the change and handed back to Overseer.",
		);
		expect(
			sentMessages.some((message) =>
				message.includes("Persistence succeeded. Run a read-only verification"),
			),
		).toBe(false);
	});

	it("repairs repeated no-progress cycles and aborts after continued repetition", async () => {
		const repeatingResponse = JSON.stringify({
			version: AGENT_PROTOCOL_VERSION,
			plan: ["Inspect package.json.", "Return control."],
			next_step: "Inspect package.json.",
			actions: [{ type: "run_ro_shell", command: "cat package.json" }],
			task_status: "in_progress",
		});
		const responses = Array.from({ length: 6 }, () => repeatingResponse);
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

		const runner = new AgentRunner(
			makeFakeShell(async () => ({
				stdout: "same output",
				stderr: "",
				exitCode: 0,
			})),
		);
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			8,
			{
				shellAccess: "read_only",
				maxActionsPerTurn: 1,
			},
		);

		expect(result.finalResponse).toContain(
			"Stopped after repeated no-progress loops",
		);
		expect(
			sentMessages.some((message) => message.includes("LOOP DETECTED:")),
		).toBe(true);
	});

	it("rejects responses that exceed the configured action limit", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect files.", "Return control."],
				next_step: "Inspect files.",
				actions: [
					{ type: "run_ro_shell", command: "pwd" },
					{ type: "run_ro_shell", command: "ls" },
				],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect files.", "Return control."],
				next_step: "Inspect files.",
				actions: [{ type: "run_ro_shell", command: "pwd" }],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect files.", "Return control."],
				next_step: "Return control.",
				actions: [],
				task_status: "done",
				final_response: "Completed safely.",
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

		const runner = new AgentRunner(
			makeFakeShell(async () => ({
				stdout: "ok",
				stderr: "",
				exitCode: 0,
			})),
		);
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			6,
			{
				shellAccess: "read_only",
				maxActionsPerTurn: 1,
			},
		);

		expect(result.finalResponse).toBe("Completed safely.");
		expect(sentMessages[1]).toContain("actions may contain at most 1 item");
	});
});
