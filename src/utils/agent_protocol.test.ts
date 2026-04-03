import { describe, expect, it } from "vitest";
import {
	buildContinuationMessage,
	parseAgentProtocolResponse,
} from "./agent_protocol.js";

describe("parseAgentProtocolResponse", () => {
	it("parses a marker-based response", () => {
		const response = `
PLAN:
1. Inspect files.
2. Fix bug.

NEXT_STEP:
Read the relevant files before editing.

ACTIONS:
\`\`\`json
[
  {"type": "run_ro_shell", "command": "ls -la"}
]
\`\`\`

TASK_STATUS:
in_progress
`;
		const parsed = parseAgentProtocolResponse(response);

		expect(parsed.protocol.task_status).toBe("in_progress");
		expect(parsed.protocol.plan).toEqual(["1. Inspect files.", "2. Fix bug."]);
		expect(parsed.protocol.next_step).toBe(
			"Read the relevant files before editing.",
		);
		expect(parsed.protocol.actions).toEqual([
			{ type: "run_ro_shell", command: "ls -la" },
		]);
	});

	it("parses a done response with final response", () => {
		const response = `
PLAN:
1. Done.

NEXT_STEP:
Finished.

ACTIONS:
[]

TASK_STATUS:
done

FINAL_RESPONSE:
Work is complete.
`;
		const parsed = parseAgentProtocolResponse(response);

		expect(parsed.protocol.task_status).toBe("done");
		expect(parsed.protocol.final_response).toBe("Work is complete.");
	});

	it("parses optional markers", () => {
		const response = `
PLAN:
Plan.

NEXT_STEP:
Next.

ACTIONS:
[]

TASK_STATUS:
done

GITHUB_COMMENT:
Updating issue.

FINAL_RESPONSE:
Done.

HANDOFF_TO:
@planner
`;
		const parsed = parseAgentProtocolResponse(response);

		expect(parsed.protocol.github_comment).toBe("Updating issue.");
		expect(parsed.protocol.handoff_to).toBe("@planner");
	});

	it("rejects response missing required markers", () => {
		const response = `
PLAN:
Plan.

TASK_STATUS:
in_progress
`;
		expect(() => parseAgentProtocolResponse(response)).toThrow(
			/Missing NEXT_STEP/i,
		);
	});

	it("rejects invalid task status", () => {
		const response = `
PLAN:
Plan.

NEXT_STEP:
Next.

TASK_STATUS:
invalid
`;
		expect(() => parseAgentProtocolResponse(response)).toThrow(
			/task_status must be either/i,
		);
	});

	it("builds continuation messages that restate task and prior response", () => {
		const message = buildContinuationMessage({
			originalTask: "Developer Task:\nTask ID: issue-55",
			iteration: 3,
			previousPlan: ["Read the plan", "Implement the change"],
			previousResponseJson: "PLAN: ...",
			previousGithubComment: "Reading the plan before changing code.",
			actionOutput: "Plan contents",
		});

		expect(message).toContain("ORIGINAL TASK:");
		expect(message).toContain("Task ID: issue-55");
		expect(message).toContain("CURRENT ITERATION: 3");
		expect(message).toContain("MOST RECENT PLAN:");
		expect(message).toContain("- Read the plan");
		expect(message).toContain("MOST RECENT STRUCTURED RESPONSE:");
		expect(message).toContain(
			"If an action yielded the data you need, do not repeat it.",
		);
		expect(message).toContain("MOST RECENT GITHUB STATUS COMMENT:");
		expect(message).toContain("Reading the plan before changing code.");
		expect(message).toContain("LATEST ACTION OUTPUT:");
		expect(message).toContain("Plan contents");
	});
});
