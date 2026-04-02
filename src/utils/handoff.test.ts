import { describe, expect, it } from "vitest";
import {
	buildNextStepLine,
	resolveNextPersona,
	stripTrailingNextStep,
} from "./handoff.js";

describe("handoff helpers", () => {
	it("resolves non-overseer bots back to overseer", () => {
		expect(resolveNextPersona("planner")).toBe("overseer");
		expect(buildNextStepLine("planner")).toBe(
			"Next step: @overseer to take action",
		);
	});

	it("resolves overseer handoffs from structured targets", () => {
		expect(resolveNextPersona("overseer", "@planner")).toBe("planner");
		expect(buildNextStepLine("overseer", "@planner")).toBe(
			"Next step: @planner to take action",
		);
		expect(resolveNextPersona("overseer", "human_review_required")).toBeNull();
		expect(buildNextStepLine("overseer", "human_review_required")).toBe(
			"Next step: human review required",
		);
	});

	it("strips a trailing next-step suffix from final text", () => {
		expect(
			stripTrailingNextStep(
				"Implemented the change.\n\nNext step: @planner to take action",
			),
		).toBe("Implemented the change.");
	});
});
