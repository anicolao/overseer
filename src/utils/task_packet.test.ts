import { describe, expect, it } from "vitest";
import { parseTaskPacket, renderTaskPacketForPrompt } from "./task_packet.js";

describe("task_packet", () => {
	it("parses the structured Developer Task handoff", () => {
		const body = [
			"I am the **Overseer**, and I am responding to issue #42 from @alice.",
			"",
			"Developer Task:",
			"Task ID: auth-fix",
			"Plan File: docs/plans/auth-fix.md",
			"Files To Read:",
			"- src/auth.ts",
			"- src/auth.test.ts",
			"Task Summary: Fix the expired-token branch so the API returns 401.",
			"Done When: Expired tokens consistently produce a 401 response and the regression test passes.",
			"Verification:",
			"- npm test -- src/auth.test.ts",
			"",
			"Next step: @developer-tester to take action",
		].join("\n");

		const packet = parseTaskPacket(body);

		expect(packet.hasStructuredHandoff).toBe(true);
		expect(packet.taskId).toBe("auth-fix");
		expect(packet.planFile).toBe("docs/plans/auth-fix.md");
		expect(packet.filesToRead).toEqual([
			"docs/plans/auth-fix.md",
			"src/auth.ts",
			"src/auth.test.ts",
		]);
		expect(packet.taskSummary).toContain("expired-token");
		expect(packet.doneWhen).toContain("401 response");
		expect(packet.verificationCommands).toEqual([
			"npm test -- src/auth.test.ts",
		]);
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
		expect(packet.verificationCommands).toEqual([]);
	});

	it("renders a canonical packet for the worker prompt", () => {
		const rendered = renderTaskPacketForPrompt(
			parseTaskPacket(
				[
					"Developer Task:",
					"Task ID: none",
					"Plan File: docs/plans/one.md",
					"Files To Read: src/one.ts, src/two.ts",
					"Task Summary: Update the parser.",
					"Done When: The parser accepts the new syntax.",
					"Verification: npm test -- src/parser.test.ts",
				].join("\n"),
			),
		);

		expect(rendered).toContain("CANONICAL TASK PACKET:");
		expect(rendered).toContain(
			"Files To Read: docs/plans/one.md, src/one.ts, src/two.ts",
		);
		expect(rendered).toContain("Task Summary: Update the parser.");
		expect(rendered).toContain("RAW DIRECTED TASK:");
	});
});
