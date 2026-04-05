import { afterEach, describe, expect, it } from "vitest";
import { getBotOrThrow, loadBotRegistry } from "../bots/bot_config.js";
import { TaskPersona } from "./task_persona.js";

const ORIGINAL_ENV = { ...process.env };

describe("TaskPersona", () => {
	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	it("hands impossible task packets back to Overseer before invoking the LLM", async () => {
		const registry = loadBotRegistry();
		const bot = getBotOrThrow(registry, "developer-tester");
		let startChatCalled = false;
		const gemini = {
			startChat() {
				startChatCalled = true;
				throw new Error("startChat should not be called for invalid packets");
			},
		};
		const persistence = {
			persistWork: async () => ({
				ok: true as const,
				branch: "bot/issue-1",
				commit_sha: "abc123",
				changed_files: [],
				message: "Persisted successfully.",
			}),
		};
		const persona = new TaskPersona(bot, gemini as never, persistence as never);

		const result = await persona.handleTask(
			"anicolao",
			"overseer",
			85,
			[
				"Developer Task:",
				"Task ID: impossible-step",
				"Design File: docs/design/persist-qa.md",
				"Design Approval Status: approved",
				"Plan File: docs/plans/persist-qa.md",
				"Files To Read:",
				"- src/action-types.ts",
				"- src/action-handler.ts",
				"Task Summary: Implement the invented dispatcher seam.",
			].join("\n"),
		);

		expect(startChatCalled).toBe(false);
		expect(result.handoffTo).toBe("@overseer");
		expect(result.finalResponse).toContain("do not exist");
		expect(result.finalResponse).toContain("repair the design/plan");
	});

	it("adds a semantic repair note for architect revision tasks", async () => {
		const registry = loadBotRegistry();
		const bot = getBotOrThrow(registry, "product-architect");
		let receivedInitialMessage = "";
		const gemini = {
			startChat() {
				return {
					sendMessage: async (message: string) => {
						receivedInitialMessage = message;
						return {
							text: JSON.stringify({
								version: "overseer/v1",
								plan: ["Read the design artifact."],
								next_step: "Stop with a blocker for test purposes.",
								actions: [],
								task_status: "done",
								final_response: "Blocked for test.",
								handoff_to: "@overseer",
							}),
						};
					},
				};
			},
		};
		const persistence = {
			persistWork: async () => ({
				ok: true as const,
				branch: "bot/issue-1",
				commit_sha: "abc123",
				changed_files: [],
				message: "Persisted successfully.",
			}),
		};
		const persona = new TaskPersona(bot, gemini as never, persistence as never);

		await persona.handleTask(
			"anicolao",
			"overseer",
			85,
			[
				"Architect Task:",
				"Task ID: repair-design",
				"Design File: docs/current-system.md",
				"Design Approval Status: needs_revision",
				"Files To Read:",
				"- src/utils/agent_protocol.ts",
				"- src/dispatch.ts",
				"Current Step: Rewrite the stale design sections against the real source files.",
				"Task Summary: Repair the design to match the current repository seams.",
				"Done When: The design file names the real implementation files and seams.",
			].join("\n"),
		);

		expect(receivedInitialMessage).toContain("REPAIR EXECUTION NOTE:");
		expect(receivedInitialMessage).toContain(
			"This is a semantic design-repair task.",
		);
		expect(receivedInitialMessage).toContain(
			"Do not spend multiple turns searching for literal stale strings.",
		);
	});

	it("routes matching task bots through Gemini CLI when enabled", async () => {
		process.env.TASK_PERSONA_BACKEND = "gemini_cli";
		process.env.TASK_PERSONA_CLI_BOTS = "developer-tester";

		const registry = loadBotRegistry();
		const bot = getBotOrThrow(registry, "developer-tester");
		let startChatCalled = false;
		let cliCalled = false;
		const gemini = {
			startChat() {
				startChatCalled = true;
				throw new Error("startChat should not be called in CLI mode");
			},
		};
		const persistence = {
			persistWork: async () => ({
				ok: true as const,
				branch: "bot/issue-1",
				commit_sha: "abc123",
				changed_files: [],
				message: "Persisted successfully.",
			}),
		};
		const geminiCli = {
			runTask: async (options: {
				botId: string;
				displayName: string;
				systemInstruction: string;
				taskMessage: string;
			}) => {
				cliCalled = true;
				expect(options.botId).toBe("developer-tester");
				expect(options.displayName).toBe("Developer/Tester");
				expect(options.systemInstruction).toContain(
					"If a top-level `WORKFLOW.md` exists",
				);
				expect(options.taskMessage).toContain("CANONICAL TASK PACKET:");
				expect(options.taskMessage).toContain(
					"Task Summary: Update the runtime seam.",
				);
				return {
					finalResponse: "CLI completed the task.",
					handoffTo: "@overseer" as const,
					log: "CLI log",
				};
			},
		};
		const persona = new TaskPersona(
			bot,
			gemini as never,
			persistence as never,
			geminiCli as never,
		);

		const result = await persona.handleTask(
			"anicolao",
			"overseer",
			99,
			[
				"Developer Task:",
				"Task ID: cli-path",
				"Design File: docs/current-system.md",
				"Design Approval Status: approved",
				"Files To Read:",
				"- src/utils/agent_runner.ts",
				"Task Summary: Update the runtime seam.",
				"Done When: A code change is proposed.",
			].join("\n"),
		);

		expect(startChatCalled).toBe(false);
		expect(cliCalled).toBe(true);
		expect(result.finalResponse).toBe("CLI completed the task.");
		expect(result.handoffTo).toBe("@overseer");
	});
});
