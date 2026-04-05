import { describe, expect, it } from "vitest";
import { getBotOrThrow, loadBotRegistry } from "./bot_config.js";

describe("bot_config", () => {
	it("loads bot prompts from markdown files and expands the protocol version", () => {
		const registry = loadBotRegistry();
		const developer = getBotOrThrow(registry, "developer-tester");
		const overseer = getBotOrThrow(registry, "overseer");

		expect(developer.kind).toBe("task");
		expect(developer.shellAccess).toBe("read_write");
		expect(developer.allowPersistWork).toBe(true);
		expect(developer.requirePostPersistVerification).toBe(false);
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
			"You implement one small increment of an approved design.",
		);
		expect(developer.prompt.concatenatedPrompt).toContain(
			"if `Design Approval Status` is not `approved`, stop and hand back to Overseer instead of implementing",
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
		expect(overseer.prompt.concatenatedPrompt).toContain(
			"You are a router of tasks, not a solver of technical subtasks.",
		);
		expect(overseer.prompt.concatenatedPrompt).toContain(
			"do not create ad hoc implementation increments that were not validated by the right specialist",
		);
		expect(overseer.prompt.concatenatedPrompt).toContain(
			"if implementation uncovers a missing step or architectural omission, send the work back to `@product-architect` or `@planner`",
		);
	});

	it("exposes overseer and task bots through the registry", () => {
		const registry = loadBotRegistry();

		expect(getBotOrThrow(registry, "overseer").kind).toBe("overseer");
		expect(getBotOrThrow(registry, "quality").shellAccess).toBe("read_write");
		expect(getBotOrThrow(registry, "quality").allowPersistWork).toBe(false);
		expect(
			getBotOrThrow(registry, "quality").requirePostPersistVerification,
		).toBe(true);
		expect(getBotOrThrow(registry, "overseer").maxActionsPerTurn).toBe(2);
		expect(
			getBotOrThrow(registry, "quality").prompt.concatenatedPrompt,
		).toContain(
			"You are authorized to use `run_shell` to create and edit files exclusively within the `docs/qa/` directory.",
		);
		expect(registry.all).toHaveLength(5);
	});
});
