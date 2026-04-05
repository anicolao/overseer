import { describe, expect, it } from "vitest";
import { getBotOrThrow, loadBotRegistry } from "../bots/bot_config.js";
import {
	parseArgs,
	renderBotDetailMarkdown,
	renderBotListMarkdown,
} from "./inspect_bots.js";

describe("inspect_bots", () => {
	it("renders a markdown list of configured bots", () => {
		const registry = loadBotRegistry();
		const markdown = renderBotListMarkdown(registry.all);

		expect(markdown).toContain("# Bots");
		expect(markdown).toContain("| `overseer` | Overseer |");
		expect(markdown).toContain("| `developer-tester` | Developer/Tester |");
		expect(markdown).toContain("| `read_only` |");
		expect(markdown).toContain("| `read_write` |");
	});

	it("renders detail for a specific bot including prompt files and contents", () => {
		const registry = loadBotRegistry();
		const bot = getBotOrThrow(registry, "developer-tester");
		const markdown = renderBotDetailMarkdown(bot);

		expect(markdown).toContain("# Developer/Tester");
		expect(markdown).toContain("Shell Access: `read_write`");
		expect(markdown).toContain("Max Actions Per Turn: 2");
		expect(markdown).toContain("## Prompt Files");
		expect(markdown).toContain("`prompts/shared/developer-guidance.md`");
		expect(markdown).toContain("## Concatenated Prompt");
		expect(markdown).toContain("If a top-level `WORKFLOW.md` exists");
	});

	it("parses positional and flagged bot ids", () => {
		expect(parseArgs([])).toEqual({});
		expect(parseArgs(["planner"])).toEqual({ botId: "planner" });
		expect(parseArgs(["--bot", "quality"])).toEqual({ botId: "quality" });
	});
});
