import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_PROTOCOL_VERSION } from "./agent_protocol.js";
import { AgentRunner } from "./agent_runner.js";
import type { ShellService } from "./shell.js";

describe("AgentRunner persist_qa", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "overseer-persist-qa-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	const makeFakeShell = (): ShellService =>
		({
			async executeActions() {
				return "";
			},
		}) as unknown as ShellService;

	it("successfully persists QA documentation to docs/qa/", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Persist QA results."],
				next_step: "Persist QA results.",
				actions: [
					{
						type: "persist_qa",
						path: "docs/qa/test-results.md",
						content: "# QA Results\nAll tests passed.",
					},
				],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Return control."],
				next_step: "Return control.",
				actions: [],
				task_status: "done",
				final_response: "Persisted QA results.",
			}),
		];

		const gemini = {
			startChat() {
				return {
					async sendMessage() {
						const next = responses.shift();
						return { text: next, response: { text: () => next } };
					},
				};
			},
		};

		const runner = new AgentRunner(makeFakeShell());
		await runner.runAutonomousLoop(gemini as never, "System", "Task", 5);

		const filePath = join(tempDir, "docs/qa/test-results.md");
		expect(existsSync(filePath)).toBe(true);
		expect(readFileSync(filePath, "utf8")).toBe(
			"# QA Results\nAll tests passed.",
		);
	});

	it("rejects persist_qa for paths outside docs/qa/", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Try to persist to invalid path."],
				next_step: "Try to persist to invalid path.",
				actions: [
					{
						type: "persist_qa",
						path: "src/malicious.ts",
						content: "console.log('hacked')",
					},
				],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Return control."],
				next_step: "Return control.",
				actions: [],
				task_status: "done",
				final_response: "Failed as expected.",
			}),
		];

		const gemini = {
			startChat() {
				return {
					async sendMessage() {
						const next = responses.shift();
						return { text: next, response: { text: () => next } };
					},
				};
			},
		};

		const runner = new AgentRunner(makeFakeShell());
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System",
			"Task",
			5,
		);

		expect(result.log).toContain("invalid_path");
		expect(result.log).toContain(
			"persist_qa only allowed for paths starting with docs/qa/",
		);
		expect(existsSync(join(tempDir, "src/malicious.ts"))).toBe(false);
	});

	it("automatically creates subdirectories within docs/qa/", async () => {
		const responses = [
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Persist QA results to nested path."],
				next_step: "Persist QA results to nested path.",
				actions: [
					{
						type: "persist_qa",
						path: "docs/qa/nested/dir/results.md",
						content: "Nested results.",
					},
				],
				task_status: "in_progress",
			}),
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Return control."],
				next_step: "Return control.",
				actions: [],
				task_status: "done",
				final_response: "Persisted nested QA results.",
			}),
		];

		const gemini = {
			startChat() {
				return {
					async sendMessage() {
						const next = responses.shift();
						return { text: next, response: { text: () => next } };
					},
				};
			},
		};

		const runner = new AgentRunner(makeFakeShell());
		await runner.runAutonomousLoop(gemini as never, "System", "Task", 5);

		const filePath = join(tempDir, "docs/qa/nested/dir/results.md");
		expect(existsSync(filePath)).toBe(true);
		expect(readFileSync(filePath, "utf8")).toBe("Nested results.");
	});
});
