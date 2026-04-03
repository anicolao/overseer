import { describe, expect, it } from "vitest";
import {
	AGENT_PROTOCOL_VERSION,
	buildContinuationMessage,
	parseAgentProtocolResponse,
} from "./agent_protocol.js";

describe("parseAgentProtocolResponse", () => {
	it("parses a plain JSON response", () => {
		const parsed = parseAgentProtocolResponse(
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Inspect the repository root."],
				next_step: "Inspect the repository root.",
				actions: [{ type: "run_ro_shell", command: "ls -la" }],
				task_status: "in_progress",
			}),
		);

		expect(parsed.protocol.task_status).toBe("in_progress");
		expect(parsed.protocol.actions).toEqual([
			{ type: "run_ro_shell", command: "ls -la" },
		]);
	});

	it("parses fenced JSON responses", () => {
		const parsed = parseAgentProtocolResponse(`\`\`\`json
{
  "version": "${AGENT_PROTOCOL_VERSION}",
  "plan": ["Finish the assigned task."],
  "next_step": "Finish up.",
  "actions": [],
  "task_status": "done",
  "final_response": "Completed successfully."
}
\`\`\``);

		expect(parsed.protocol.task_status).toBe("done");
		expect(parsed.protocol.final_response).toBe("Completed successfully.");
	});

	it("extracts an embedded JSON object", () => {
		const parsed = parseAgentProtocolResponse(`
I will comply.
{
  "version": "${AGENT_PROTOCOL_VERSION}",
  "plan": ["Review shell output."],
  "next_step": "Review shell output.",
 "actions": [{"type": "run_ro_shell", "command": "cat package.json"}],
  "task_status": "in_progress"
}`);

		expect(parsed.protocol.actions[0]).toEqual({
			type: "run_ro_shell",
			command: "cat package.json",
		});
	});

	it("parses run_shell actions", () => {
		const parsed = parseAgentProtocolResponse(
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Edit the target file."],
				next_step: "Edit the target file.",
				actions: [{ type: "run_shell", command: "printf ok >> target.txt" }],
				task_status: "in_progress",
			}),
		);

		expect(parsed.protocol.actions).toEqual([
			{ type: "run_shell", command: "printf ok >> target.txt" },
		]);
	});

	it("parses persist_work actions", () => {
		const parsed = parseAgentProtocolResponse(
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Persist the prepared plan."],
				next_step: "Persist the prepared plan.",
				actions: [{ type: "persist_work" }],
				task_status: "in_progress",
			}),
		);

		expect(parsed.protocol.actions).toEqual([{ type: "persist_work" }]);
	});

	it("parses optional github_comment and plan fields", () => {
		const parsed = parseAgentProtocolResponse(
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Read repository guidance", "Implement the task"],
				next_step: "Read WORKFLOW.md.",
				actions: [
					{ type: "run_ro_shell", command: "cat WORKFLOW.md" },
					{ type: "run_ro_shell", command: "cat docs/plans/current-plan.md" },
				],
				task_status: "in_progress",
				github_comment: "Started work and am reading repository guidance.",
			}),
		);

		expect(parsed.protocol.plan).toEqual([
			"Read repository guidance",
			"Implement the task",
		]);
		expect(parsed.protocol.github_comment).toBe(
			"Started work and am reading repository guidance.",
		);
		expect(parsed.protocol.actions).toHaveLength(2);
	});

	it("parses optional handoff_to on done responses", () => {
		const parsed = parseAgentProtocolResponse(
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Delegate to the planner."],
				next_step: "Return control to the dispatcher.",
				actions: [],
				task_status: "done",
				handoff_to: "@planner",
				final_response: "Prepared the planner handoff.",
			}),
		);

		expect(parsed.protocol.handoff_to).toBe("@planner");
	});

	it("rejects invalid handoff_to values", () => {
		expect(() =>
			parseAgentProtocolResponse(
				JSON.stringify({
					version: AGENT_PROTOCOL_VERSION,
					plan: ["Stop."],
					next_step: "Stop.",
					actions: [],
					task_status: "done",
					handoff_to: "@not-a-bot",
					final_response: "Done.",
				}),
			),
		).toThrow(/handoff_to/);
	});

	it("rejects handoff_to on in-progress responses", () => {
		expect(() =>
			parseAgentProtocolResponse(
				JSON.stringify({
					version: AGENT_PROTOCOL_VERSION,
					plan: ["Inspect files."],
					next_step: "Inspect files.",
					actions: [{ type: "run_ro_shell", command: "ls" }],
					task_status: "in_progress",
					handoff_to: "@planner",
				}),
			),
		).toThrow(/handoff_to/);
	});

	it("rejects done responses without final_response", () => {
		expect(() =>
			parseAgentProtocolResponse(
				JSON.stringify({
					version: AGENT_PROTOCOL_VERSION,
					plan: ["Stop."],
					next_step: "Stop.",
					actions: [],
					task_status: "done",
				}),
			),
		).toThrow(/final_response/);
	});

	it("rejects responses without a plan", () => {
		expect(() =>
			parseAgentProtocolResponse(
				JSON.stringify({
					version: AGENT_PROTOCOL_VERSION,
					next_step: "Inspect files.",
					actions: [{ type: "run_ro_shell", command: "ls" }],
					task_status: "in_progress",
				}),
			),
		).toThrow(/plan/);
	});

	it("builds continuation messages that restate task and prior response", () => {
		const message = buildContinuationMessage({
			originalTask: "Developer Task:\nTask ID: issue-55",
			iteration: 3,
			previousPlan: ["Read the plan", "Implement the change"],
			previousResponseJson: JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				plan: ["Read the plan", "Implement the change"],
				next_step: "Read the plan",
				actions: [
					{ type: "run_ro_shell", command: "cat docs/plans/current.md" },
				],
				task_status: "in_progress",
			}),
			previousGithubComment: "Reading the plan before changing code.",
			actionOutput:
				"--- EXECUTING: cat docs/plans/current.md ---\nSTDOUT:\nPlan contents",
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
		expect(message).toContain('"next_step":"Read the plan"');
		expect(message).toContain("MOST RECENT GITHUB STATUS COMMENT:");
		expect(message).toContain("Reading the plan before changing code.");
		expect(message).toContain("LATEST ACTION OUTPUT:");
		expect(message).toContain("Plan contents");
		expect(message).toContain(
			'Continue the task using protocol "overseer/v1".',
		);
	});
});
