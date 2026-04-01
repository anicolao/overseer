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

		expect(parsed.protocol.actions[0]?.command).toBe("cat package.json");
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
