import { afterEach, describe, expect, it } from "vitest";
import {
	GeminiCliService,
	shouldUseGeminiCliForTaskBot,
} from "./gemini_cli.js";

const ORIGINAL_ENV = { ...process.env };

describe("shouldUseGeminiCliForTaskBot", () => {
	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it("returns false when the CLI backend is not enabled", () => {
		delete process.env.TASK_PERSONA_BACKEND;
		delete process.env.TASK_PERSONA_CLI_BOTS;

		expect(shouldUseGeminiCliForTaskBot("developer-tester")).toBe(false);
	});

	it("returns true for all task bots when no allowlist is configured", () => {
		process.env.TASK_PERSONA_BACKEND = "gemini_cli";
		delete process.env.TASK_PERSONA_CLI_BOTS;

		expect(shouldUseGeminiCliForTaskBot("developer-tester")).toBe(true);
		expect(shouldUseGeminiCliForTaskBot("planner")).toBe(true);
	});

	it("respects the configured bot allowlist", () => {
		process.env.TASK_PERSONA_BACKEND = "gemini_cli";
		process.env.TASK_PERSONA_CLI_BOTS = "planner, developer-tester";

		expect(shouldUseGeminiCliForTaskBot("developer-tester")).toBe(true);
		expect(shouldUseGeminiCliForTaskBot("planner")).toBe(true);
		expect(shouldUseGeminiCliForTaskBot("quality")).toBe(false);
	});
});

describe("GeminiCliService", () => {
	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it("wraps the persona prompt and parses a successful headless response", async () => {
		let capturedInvocation:
			| {
					command: string;
					args: string[];
					cwd: string;
					env: NodeJS.ProcessEnv;
			  }
			| undefined;
		const service = new GeminiCliService(async (invocation) => {
			capturedInvocation = {
				command: invocation.command,
				args: invocation.args,
				cwd: invocation.cwd,
				env: invocation.env,
			};
			return {
				exitCode: 0,
				timedOut: false,
				stderr: "",
				stdout: JSON.stringify({
					response: JSON.stringify({
						finalResponse: "Implemented the change and handed back.",
						handoffTo: "@overseer",
						log: "Changed src/example.ts and ran npm test.",
					}),
					stats: {
						totalTokens: 1234,
					},
				}),
			};
		}, 1000);

		const result = await service.runTask({
			botId: "developer-tester",
			displayName: "Developer/Tester",
			systemInstruction: "SYSTEM PROMPT",
			taskMessage: "TASK MESSAGE",
			modelName: "gemini-3.1-pro-preview",
			cwd: process.cwd(),
		});

		expect(result.finalResponse).toBe(
			"Implemented the change and handed back.",
		);
		expect(result.handoffTo).toBe("@overseer");
		expect(result.log).toContain("Changed src/example.ts and ran npm test.");
		expect(result.log).toContain("GEMINI CLI HEADLESS STATS:");
		expect(result.log).toContain('"totalTokens": 1234');
		expect(capturedInvocation).toBeDefined();
		expect(capturedInvocation?.command).toBe("npx");
		expect(capturedInvocation?.args[0]).toBe("--no-install");
		expect(capturedInvocation?.args[1]).toBe("gemini");
		expect(capturedInvocation?.args).toContain("--approval-mode");
		expect(capturedInvocation?.args).toContain("yolo");
		expect(capturedInvocation?.args).toContain("--output-format");
		expect(capturedInvocation?.args).toContain("json");
		expect(capturedInvocation?.args).toContain("-p");
		expect(capturedInvocation?.args).toContain("TASK MESSAGE:\n\nTASK MESSAGE");
		expect(capturedInvocation?.env.GEMINI_SYSTEM_MD).toBeTruthy();
	});

	it("accepts fenced JSON payloads from the CLI response", async () => {
		const service = new GeminiCliService(async () => ({
			exitCode: 0,
			timedOut: false,
			stderr: "",
			stdout: JSON.stringify({
				response: '```json\n{"finalResponse":"Done.","log":"All good."}\n```',
				stats: {},
			}),
		}));

		const result = await service.runTask({
			botId: "planner",
			displayName: "Planner",
			systemInstruction: "PROMPT",
			taskMessage: "TASK",
		});

		expect(result.finalResponse).toBe("Done.");
		expect(result.log).toContain("All good.");
	});

	it("returns a blocked handoff when the CLI output is not JSON", async () => {
		const service = new GeminiCliService(async () => ({
			exitCode: 0,
			timedOut: false,
			stderr: "stderr text",
			stdout: "not-json",
		}));

		const result = await service.runTask({
			botId: "planner",
			displayName: "Planner",
			systemInstruction: "PROMPT",
			taskMessage: "TASK",
		});

		expect(result.handoffTo).toBe("@overseer");
		expect(result.finalResponse).toContain(
			"did not return machine-readable JSON output",
		);
		expect(result.log).toContain("Failed to parse Gemini CLI headless output");
	});

	it("returns a blocked handoff when the CLI times out", async () => {
		const service = new GeminiCliService(
			async () => ({
				exitCode: null,
				timedOut: true,
				stderr: "timed out",
				stdout: "",
			}),
			25,
		);

		const result = await service.runTask({
			botId: "quality",
			displayName: "Quality",
			systemInstruction: "PROMPT",
			taskMessage: "TASK",
		});

		expect(result.handoffTo).toBe("@overseer");
		expect(result.finalResponse).toContain("timed out");
		expect(result.log).toContain("25ms");
	});
});
