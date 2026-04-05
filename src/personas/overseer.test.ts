import { describe, expect, it } from "vitest";
import {
	extractQuotedCorrectionMentions,
	extractRepoPathMentions,
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
