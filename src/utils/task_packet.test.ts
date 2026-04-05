import { describe, expect, it } from "vitest";
import {
	parseTaskPacket,
	renderTaskPacketForPrompt,
	validateTaskPacketForExecution,
} from "./task_packet.js";

describe("task_packet", () => {
	it("parses the structured Architect Task handoff", () => {
		const body = [
			"I am the **Overseer**, and I am responding to issue #42 from @alice.",
			"",
			"Architect Task:",
			"Task ID: parser-design",
			"Design File: docs/architecture/parser-v2.md",
			"Design Approval Status: needs_revision",
			"Files To Read:",
			"- src/parser.ts",
			"- src/parser.test.ts",
			"Human Correction: Do not invent parser-v1 classes that are not present in the repository.",
			"Current Step: Repair the design so it matches the current parser pipeline.",
			"Task Summary: Update the parser design doc to reflect the real implementation seams before planning further work.",
			"Done When: docs/architecture/parser-v2.md matches the source layout and calls out open decisions for human review.",
			"Verification:",
			"- git diff -- docs/architecture/parser-v2.md",
			"Likely Next Step: Ask for human approval on the revised design before planning implementation.",
			"",
			"Next step: @product-architect to take action",
		].join("\n");

		const packet = parseTaskPacket(body);

		expect(packet.hasStructuredHandoff).toBe(true);
		expect(packet.handoffType).toBe("architect");
		expect(packet.designFile).toBe("docs/architecture/parser-v2.md");
		expect(packet.designApprovalStatus).toBe("needs_revision");
		expect(packet.humanCorrection).toContain("Do not invent parser-v1 classes");
		expect(packet.filesToRead).toEqual([
			"docs/architecture/parser-v2.md",
			"src/parser.ts",
			"src/parser.test.ts",
		]);
		expect(packet.taskSummary).toContain("parser design doc");
	});

	it("parses the structured Developer Task handoff", () => {
		const body = [
			"I am the **Overseer**, and I am responding to issue #42 from @alice.",
			"",
			"Developer Task:",
			"Task ID: auth-fix",
			"Design File: docs/architecture/auth-flow.md",
			"Design Approval Status: approved",
			"Plan File: docs/plans/auth-fix.md",
			"Files To Read:",
			"- src/auth.ts",
			"- src/auth.test.ts",
			"Current Step: Fix the expired-token handling branch.",
			"Smallest Useful Increment: Update src/auth.ts so expired tokens return 401 before touching broader auth flows.",
			"Stop After: src/auth.ts returns 401 for expired tokens and the targeted regression test passes.",
			"Task Summary: Fix the expired-token branch so the API returns 401.",
			"Done When: Expired tokens consistently produce a 401 response and the regression test passes.",
			"Progress Evidence:",
			"- git diff -- src/auth.ts src/auth.test.ts",
			"Verification:",
			"- npm test -- src/auth.test.ts",
			"Likely Next Step: Have Overseer verify the diff and decide whether any auth cleanup remains.",
			"",
			"Next step: @developer-tester to take action",
		].join("\n");

		const packet = parseTaskPacket(body);

		expect(packet.hasStructuredHandoff).toBe(true);
		expect(packet.handoffType).toBe("developer");
		expect(packet.taskId).toBe("auth-fix");
		expect(packet.designFile).toBe("docs/architecture/auth-flow.md");
		expect(packet.designApprovalStatus).toBe("approved");
		expect(packet.planFile).toBe("docs/plans/auth-fix.md");
		expect(packet.filesToRead).toEqual([
			"docs/architecture/auth-flow.md",
			"docs/plans/auth-fix.md",
			"src/auth.ts",
			"src/auth.test.ts",
		]);
		expect(packet.currentStep).toContain("expired-token handling");
		expect(packet.smallestUsefulIncrement).toContain("src/auth.ts");
		expect(packet.stopAfter).toContain("targeted regression test");
		expect(packet.taskSummary).toContain("expired-token");
		expect(packet.doneWhen).toContain("401 response");
		expect(packet.progressEvidence).toEqual([
			"git diff -- src/auth.ts src/auth.test.ts",
		]);
		expect(packet.verificationCommands).toEqual([
			"npm test -- src/auth.test.ts",
		]);
		expect(packet.likelyNextStep).toContain("Overseer verify");
	});

	it("falls back to the directed task when no structured handoff exists", () => {
		const packet = parseTaskPacket(
			"I am the **Overseer**, and I am responding to issue #7 from @alice.\n\nPlease inspect src/index.ts and explain the bug.\n\nNext step: @quality to take action",
		);

		expect(packet.hasStructuredHandoff).toBe(false);
		expect(packet.taskSummary).toBe(
			"Please inspect src/index.ts and explain the bug.",
		);
		expect(packet.filesToRead).toEqual([]);
		expect(packet.progressEvidence).toEqual([]);
		expect(packet.verificationCommands).toEqual([]);
	});

	it("renders a canonical packet for the worker prompt", () => {
		const rendered = renderTaskPacketForPrompt(
			parseTaskPacket(
				[
					"Developer Task:",
					"Task ID: none",
					"Design File: docs/architecture/parser.md",
					"Design Approval Status: approved",
					"Plan File: docs/plans/one.md",
					"Files To Read: src/one.ts, src/two.ts",
					"Human Correction: Keep the change limited to one token shape.",
					"Current Step: Update the parser incrementally.",
					"Smallest Useful Increment: Teach the parser about one new token.",
					"Stop After: The parser accepts the new token and one focused test passes.",
					"Task Summary: Update the parser.",
					"Done When: The parser accepts the new syntax.",
					"Progress Evidence: git diff -- src/one.ts",
					"Verification: npm test -- src/parser.test.ts",
					"Likely Next Step: Expand coverage to the next token case.",
				].join("\n"),
			),
		);

		expect(rendered).toContain("CANONICAL TASK PACKET:");
		expect(rendered).toContain("Handoff Type: developer");
		expect(rendered).toContain("Design File: docs/architecture/parser.md");
		expect(rendered).toContain("Design Approval Status: approved");
		expect(rendered).toContain(
			"Files To Read: docs/architecture/parser.md, docs/plans/one.md, src/one.ts, src/two.ts",
		);
		expect(rendered).toContain(
			"Smallest Useful Increment: Teach the parser about one new token.",
		);
		expect(rendered).toContain(
			"Human Correction: Keep the change limited to one token shape.",
		);
		expect(rendered).toContain("Progress Evidence: git diff -- src/one.ts");
		expect(rendered).toContain(
			"Likely Next Step: Expand coverage to the next token case.",
		);
		expect(rendered).toContain("Missing Files: docs/architecture/parser.md");
		expect(rendered).toContain("Task Summary: Update the parser.");
		expect(rendered).toContain("RAW DIRECTED TASK:");
	});

	it("flags missing execution files for planner and developer handoffs", () => {
		const packet = parseTaskPacket(
			[
				"Developer Task:",
				"Task ID: persist-qa-step",
				"Design File: docs/design/__missing-persist-qa__.md",
				"Design Approval Status: approved",
				"Plan File: docs/plans/__missing-persist-qa__.md",
				"Files To Read:",
				"- src/action-types.ts",
				"- src/action-handler.ts",
				"Task Summary: Implement the dispatcher step.",
			].join("\n"),
		);

		const validation = validateTaskPacketForExecution(packet);

		expect(validation.ok).toBe(false);
		expect(validation.missingFiles).toEqual([
			"docs/design/__missing-persist-qa__.md",
			"docs/plans/__missing-persist-qa__.md",
			"src/action-types.ts",
			"src/action-handler.ts",
		]);
		expect(validation.message).toContain("do not exist");
	});

	it("allows architects to create a missing design file", () => {
		const packet = parseTaskPacket(
			[
				"Architect Task:",
				"Task ID: create-design",
				"Design File: docs/design/new-feature.md",
				"Design Approval Status: missing",
				"Files To Read:",
				"- src/index.ts",
				"Task Summary: Draft the missing design.",
			].join("\n"),
		);

		const validation = validateTaskPacketForExecution(packet);

		expect(validation.ok).toBe(true);
		expect(validation.missingFiles).toEqual([]);
	});

	it("allows planners to create a missing plan file", () => {
		const packet = parseTaskPacket(
			[
				"Planner Task:",
				"Task ID: create-plan",
				"Design File: README.md",
				"Design Approval Status: approved",
				"Plan File: docs/plans/new-feature.md",
				"Files To Read:",
				"- README.md",
				"Task Summary: Draft the implementation plan.",
			].join("\n"),
		);

		const validation = validateTaskPacketForExecution(packet);

		expect(validation.ok).toBe(true);
		expect(validation.missingFiles).toEqual([]);
	});
});
