import { describe, expect, it } from "vitest";
import { getBotOrThrow, loadBotRegistry } from "./bot_config.js";

describe("bot_config", () => {
	it("loads bot prompts from markdown files and expands the protocol version", () => {
		const registry = loadBotRegistry();
		const developer = getBotOrThrow(registry, "developer-tester");

		expect(developer.kind).toBe("task");
		expect(developer.shellAccess).toBe("read_write");
		expect(developer.allowPersistWork).toBe(true);
		expect(developer.maxActionsPerTurn).toBe(1);
		expect(developer.prompt.promptFiles).toContain(
			"prompts/shared/agent-protocol.md",
		);
		expect(
			developer.prompt.promptFileContents["prompts/shared/agent-protocol.md"],
		).toContain('"version": "overseer/v1"');
		expect(developer.prompt.concatenatedPrompt).toContain(
			"You are operating inside a repository checkout on GitHub Actions",
		);
		expect(developer.prompt.concatenatedPrompt).toContain(
			"You implement code and verification for one small assigned increment.",
		);
		expect(developer.prompt.concatenatedPrompt).toContain(
			'"type":"run_ro_shell"',
		);
		expect(developer.prompt.concatenatedPrompt).toContain(
			"You may return at most 1 action in a single response.",
		);
		expect(developer.prompt.concatenatedPrompt).toContain('"type":"run_shell"');
		expect(developer.prompt.concatenatedPrompt).not.toContain(
			"BEGIN PROMPT FILE:",
		);
	});

	it("exposes overseer and task bots through the registry", () => {
		const registry = loadBotRegistry();

		expect(getBotOrThrow(registry, "overseer").kind).toBe("overseer");
		expect(getBotOrThrow(registry, "quality").shellAccess).toBe("read_write");
		expect(getBotOrThrow(registry, "quality").allowPersistWork).toBe(false);
		expect(getBotOrThrow(registry, "overseer").maxActionsPerTurn).toBe(2);

		expect(registry.all).toHaveLength(5);
	});
});
