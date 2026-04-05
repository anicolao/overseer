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
		expect(developer.maxActionsPerTurn).toBe(2);
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
			"hand the blocker back to Overseer instead of asking a human for approval",
		);
		expect(developer.prompt.concatenatedPrompt).not.toContain(
			"ask the user for approval instead of providing a command",
		);
		expect(developer.prompt.concatenatedPrompt).toContain(
			"if `Design Approval Status` is not `approved`, stop and hand back to Overseer instead of implementing",
		);
		expect(developer.prompt.concatenatedPrompt).toContain(
			'"type":"run_ro_shell"',
		);
		expect(developer.prompt.concatenatedPrompt).toContain(
			"You may return at most 2 actions in a single response.",
		);
		expect(developer.prompt.concatenatedPrompt).toContain(
			'"type":"replace_in_file"',
		);
		expect(developer.prompt.concatenatedPrompt).toContain('"type":"run_shell"');
		expect(developer.prompt.concatenatedPrompt).not.toContain(
			"BEGIN PROMPT FILE:",
		);
		expect(getBotOrThrow(registry, "product-architect").maxActionsPerTurn).toBe(
			2,
		);
		expect(getBotOrThrow(registry, "planner").maxActionsPerTurn).toBe(2);
		expect(
			getBotOrThrow(registry, "product-architect").prompt.concatenatedPrompt,
		).toContain("treat the blocker as a semantic mismatch");
		expect(
			getBotOrThrow(registry, "product-architect").prompt.concatenatedPrompt,
		).toContain("under `docs/design/`");
		expect(
			getBotOrThrow(registry, "product-architect").prompt.concatenatedPrompt,
		).toContain(
			"do not create new top-level documentation directories such as `docs/designs/`",
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
		expect(overseer.prompt.concatenatedPrompt).toContain(
			"route directly to planning when it is grounded in the current repository and does not leave unresolved product decisions",
		);
		expect(overseer.prompt.concatenatedPrompt).toContain(
			"place it under `docs/design/` and place the matching plan under `docs/plans/`",
		);
		expect(overseer.prompt.concatenatedPrompt).toContain(
			"you may send a repaired task back to that same specialist instead of escalating immediately to human review",
		);
		expect(overseer.prompt.concatenatedPrompt).toContain(
			"do not frame design repair as a literal search-and-replace task unless you have verified the stale text actually appears in the artifact",
		);
		expect(
			getBotOrThrow(registry, "product-architect").prompt.concatenatedPrompt,
		).toContain("make the design implementation-ready when possible");
	});

	it("exposes overseer and task bots through the registry", () => {
		const registry = loadBotRegistry();

		expect(getBotOrThrow(registry, "overseer").kind).toBe("overseer");
		expect(getBotOrThrow(registry, "quality").shellAccess).toBe("read_write");
		expect(getBotOrThrow(registry, "quality").allowPersistWork).toBe(false);
		expect(getBotOrThrow(registry, "quality").allowPersistQa).toBe(true);
		expect(
			getBotOrThrow(registry, "quality").requirePostPersistVerification,
		).toBe(true);
		expect(getBotOrThrow(registry, "overseer").maxActionsPerTurn).toBe(2);
		expect(
			getBotOrThrow(registry, "quality").prompt.concatenatedPrompt,
		).not.toContain("- `run_shell` is unavailable to this bot.");
		expect(
			getBotOrThrow(registry, "quality").prompt.concatenatedPrompt,
		).toContain(`"type":"persist_qa"`);
		expect(registry.all).toHaveLength(5);
	});
});
