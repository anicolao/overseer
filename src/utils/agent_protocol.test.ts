import { describe, expect, it } from "vitest";
import {
	AGENT_PROTOCOL_VERSION,
	parseAgentProtocolResponse,
} from "./agent_protocol.js";

describe("parseAgentProtocolResponse", () => {
	it("parses a plain JSON response", () => {
		const parsed = parseAgentProtocolResponse(
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
				next_step: "Inspect the repository root.",
				actions: [{ type: "run_shell", command: "ls -la" }],
				task_status: "in_progress",
			}),
		);

		expect(parsed.protocol.task_status).toBe("in_progress");
		expect(parsed.protocol.actions).toEqual([
			{ type: "run_shell", command: "ls -la" },
		]);
	});

	it("parses fenced JSON responses", () => {
		const parsed = parseAgentProtocolResponse(`\`\`\`json
{
  "version": "${AGENT_PROTOCOL_VERSION}",
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
  "next_step": "Review shell output.",
 "actions": [{"type": "run_shell", "command": "cat package.json"}],
  "task_status": "in_progress"
}`);

		expect(parsed.protocol.actions[0]).toEqual({
			type: "run_shell",
			command: "cat package.json",
		});
	});

	it("parses persist_work actions", () => {
		const parsed = parseAgentProtocolResponse(
			JSON.stringify({
				version: AGENT_PROTOCOL_VERSION,
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
				next_step: "Read WORKFLOW.md.",
				actions: [{ type: "run_shell", command: "cat WORKFLOW.md" }],
				task_status: "in_progress",
				plan: ["Read repository guidance", "Implement the task"],
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
	});

	it("rejects done responses without final_response", () => {
		expect(() =>
			parseAgentProtocolResponse(
				JSON.stringify({
					version: AGENT_PROTOCOL_VERSION,
					next_step: "Stop.",
					actions: [],
					task_status: "done",
				}),
			),
		).toThrow(/final_response/);
	});
});
