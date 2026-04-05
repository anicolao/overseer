import { describe, expect, it } from "vitest";
import {
	buildDirectArchitectPlanningIterationResult,
	buildPlanPathFromDesignFile,
	extractDesignDocPathForDirectRepair,
	findPersistQaDesignValidationFindings,
	shouldBypassOverseerForArchitectDesignReview,
} from "./dispatch.js";

describe("dispatch direct architect routing", () => {
	it("recognizes implementation-ready architect comments and routes directly to planner", () => {
		const body = [
			"I am the **Product/Architect**, and I am responding to the Overseer.",
			"",
			"Created the initial MVP design document at `docs/design/persist-qa.md`.",
			"Ready for review and planning.",
		].join("\n");

		expect(extractDesignDocPathForDirectRepair(body)).toBe(
			"docs/design/persist-qa.md",
		);
		expect(buildPlanPathFromDesignFile("docs/design/persist-qa.md")).toBe(
			"docs/plans/persist-qa.md",
		);
		expect(
			shouldBypassOverseerForArchitectDesignReview(body, "Product/Architect"),
		).toBe(true);

		const result = buildDirectArchitectPlanningIterationResult(body);
		expect(result.handoffTo).toBe("@planner");
		expect(result.finalResponse).toContain("Planner Task:");
		expect(result.finalResponse).toContain(
			"Design File: docs/design/persist-qa.md",
		);
		expect(result.finalResponse).toContain(
			"Plan File: docs/plans/persist-qa.md",
		);
	});

	it("does not trigger for non-architect comments", () => {
		const body =
			"Planning can proceed autonomously. `docs/design/persist-qa.md`";

		expect(shouldBypassOverseerForArchitectDesignReview(body, "Overseer")).toBe(
			false,
		);
		expect(shouldBypassOverseerForArchitectDesignReview(body, undefined)).toBe(
			false,
		);
	});

	it("flags persist_qa design drift before planning", () => {
		const findings = findPersistQaDesignValidationFindings(`
			# Design
			Use canPersistQA in bots.json.
			Update the BotConfig interface.
			Handle persist_qa in src/utils/agent_runner.ts.
		`);

		expect(findings).toContain(
			"use the real loaded runtime type from `src/bots/bot_config.ts` instead of inventing `BotConfig`",
		);
		expect(findings).toContain(
			"use a manifest field name that matches `bots.json` conventions, such as `allow_persist_qa`, instead of camelCase `canPersistQA`",
		);
		expect(findings).toContain(
			"name the new manifest capability explicitly as `allow_persist_qa` in `bots.json`",
		);
	});
});
