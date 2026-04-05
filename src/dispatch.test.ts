import { describe, expect, it } from "vitest";
import {
	buildDirectArchitectPlanningIterationResult,
	buildPlanPathFromDesignFile,
	extractDesignDocPathForDirectRepair,
	shouldBypassOverseerForArchitectPlanningReady,
} from "./dispatch.js";

describe("dispatch direct architect routing", () => {
	it("recognizes implementation-ready architect comments and routes directly to planner", () => {
		const body = [
			"I am the **Product/Architect**, and I am responding to the Overseer.",
			"",
			"Created the initial MVP design document at `docs/design/persist-qa.md`.",
			"Planning can proceed autonomously.",
		].join("\n");

		expect(extractDesignDocPathForDirectRepair(body)).toBe(
			"docs/design/persist-qa.md",
		);
		expect(buildPlanPathFromDesignFile("docs/design/persist-qa.md")).toBe(
			"docs/plans/persist-qa.md",
		);
		expect(
			shouldBypassOverseerForArchitectPlanningReady(body, "Product/Architect"),
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

		expect(
			shouldBypassOverseerForArchitectPlanningReady(body, "Overseer"),
		).toBe(false);
		expect(shouldBypassOverseerForArchitectPlanningReady(body, undefined)).toBe(
			false,
		);
	});
});
