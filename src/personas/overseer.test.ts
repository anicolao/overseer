import { describe, expect, it } from "vitest";
import { getBotOrThrow, loadBotRegistry } from "../bots/bot_config.js";
import {
	extractDesignDocPath,
	extractQuotedCorrectionMentions,
	extractRepoPathMentions,
	OverseerPersona,
} from "./overseer.js";

describe("extractRepoPathMentions", () => {
	it("extracts repo paths from human correction comments", () => {
		const paths = extractRepoPathMentions(
			[
				"@overseer the design is still wrong.",
				"`src/utils/agent_protocol.ts` is not the execution path.",
				"Use `src/utils/agent_runner.ts`, `src/personas/task_persona.ts`, and `src/bots/bot_config.ts` instead.",
			].join(" "),
		);

		expect(paths).toEqual([
			"src/utils/agent_protocol.ts",
			"src/utils/agent_runner.ts",
			"src/personas/task_persona.ts",
			"src/bots/bot_config.ts",
		]);
	});
});

describe("extractQuotedCorrectionMentions", () => {
	it("extracts non-path quoted constraints from human correction comments", () => {
		const mentions = extractQuotedCorrectionMentions(
			[
				"@overseer the design still drifts.",
				"Please cover both `persist_qa` and `run_shell` for `@quality`,",
				"and distinguish `prompts/quality.md` from `src/personas/task_persona.ts`.",
			].join(" "),
		);

		expect(mentions).toEqual(["persist_qa", "run_shell", "@quality"]);
	});
});

describe("extractDesignDocPath", () => {
	it("finds a design doc path in text", () => {
		expect(
			extractDesignDocPath(
				"Please revise `docs/design/persist-qa.md` before implementation.",
			),
		).toBe("docs/design/persist-qa.md");
	});
});

describe("OverseerPersona direct design repair routing", () => {
	it("routes explicit human design corrections directly back to the architect", async () => {
		const registry = loadBotRegistry();
		const bot = getBotOrThrow(registry, "overseer");
		const github = {
			getIssueCommentCount: async () => 0,
			getIssue: async () => ({ data: { body: "@overseer" } }),
			getFullIssueContext: async () =>
				[
					"ISSUE TITLE: MVP validation: persist_qa end-to-end",
					"",
					"Existing design: docs/design/persist-qa.md",
				].join("\n"),
		};
		const persona = new OverseerPersona(bot, {} as never, github as never);

		const result = await persona.handleComment(
			"anicolao",
			"overseer",
			85,
			"anicolao",
			[
				"@overseer I still do not approve the design.",
				"Revise it so it explicitly covers both `persist_qa` and `run_shell` for the quality bot,",
				"and distinguish `prompts/quality.md`, `bots.json`, `src/bots/bot_config.ts`,",
				"`src/utils/agent_protocol.ts`, and `src/utils/agent_runner.ts`.",
			].join(" "),
		);

		expect(result.handoffTo).toBe("@product-architect");
		expect(result.finalResponse).toContain("Architect Task:");
		expect(result.finalResponse).toContain(
			"Design File: docs/design/persist-qa.md",
		);
		expect(result.finalResponse).toContain("- prompts/quality.md");
		expect(result.finalResponse).toContain("- bots.json");
		expect(result.finalResponse).toContain("persist_qa");
		expect(result.finalResponse).toContain("run_shell");
	});
});
