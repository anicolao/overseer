import { describe, expect, it } from "vitest";
import { getBotOrThrow, loadBotRegistry } from "./bot_config.js";

describe("bot_config", () => {
	it("loads bot prompts from markdown files and expands the protocol version", () => {
		const registry = loadBotRegistry();
		const developer = getBotOrThrow(registry, "developer-tester");

		expect(developer.kind).toBe("task");
		expect(developer.allowPersistWork).toBe(true);
		expect(developer.prompt.promptFiles).toContain(
			"prompts/shared/agent-protocol.md",
		);
		expect(
			developer.prompt.promptFileContents["prompts/shared/agent-protocol.md"],
		).toContain('"version": "overseer/v1"');
		expect(developer.prompt.concatenatedPrompt).toContain(
			"BEGIN PROMPT FILE: prompts/shared/base.md",
		);
		expect(developer.prompt.concatenatedPrompt).toContain(
			"BEGIN PROMPT FILE: prompts/developer-tester.md",
		);
	});

	it("exposes overseer and task bots through the registry", () => {
		const registry = loadBotRegistry();

		expect(getBotOrThrow(registry, "overseer").kind).toBe("overseer");
		expect(getBotOrThrow(registry, "quality").allowPersistWork).toBe(false);
		expect(registry.all).toHaveLength(5);
	});
});
