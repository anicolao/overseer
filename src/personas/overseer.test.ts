import { describe, expect, it } from "vitest";
import { extractRepoPathMentions } from "./overseer.js";

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
