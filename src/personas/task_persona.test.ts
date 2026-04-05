import { describe, expect, it } from "vitest";
import { getBotOrThrow, loadBotRegistry } from "../bots/bot_config.js";
import { TaskPersona } from "./task_persona.js";

describe("TaskPersona", () => {
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
});
