import { describe, expect, it } from "vitest";
import {
	buildTraceSummaries,
	parseArgs,
	renderMarkdownReport,
} from "./inspect_run.js";

describe("inspect_run", () => {
	it("parses CLI arguments with defaults", () => {
		const parsed = parseArgs(["12345", "--skip-download"]);

		expect(parsed.runId).toBe("12345");
		expect(parsed.skipDownload).toBe(true);
		expect(parsed.artifactsDir).toContain(".artifacts/run-12345");
	});

	it("summarizes trace events into persona flows", () => {
		const summaries = buildTraceSummaries(
			[
				{
					traceId: "trace-1",
					persona: "developer-tester",
					owner: "anicolao",
					repo: "overseer",
					issueNumber: 42,
					eventName: "issue_comment",
					sender: "alice",
					event: "agent.iteration.protocol",
					iteration: 1,
					nextStep: "Read the plan file.",
					taskStatus: "in_progress",
					actionTypes: ["run_ro_shell"],
				},
				{
					traceId: "trace-1",
					persona: "developer-tester",
					event: "dispatcher.finalize.begin",
				},
			],
			["/tmp/session_developer-tester_1.log"],
		);

		expect(summaries).toHaveLength(1);
		expect(summaries[0]?.outcome).toBe("finalized");
		expect(summaries[0]?.sessionLogPath).toContain("session_developer-tester");
		expect(summaries[0]?.keyEvents[0]).toContain("iteration 1");
	});

	it("renders a markdown report with persona and backstop sections", () => {
		const markdown = renderMarkdownReport({
			runId: "12345",
			artifactsDir: "/tmp/run-12345",
			files: ["/tmp/run-12345/trace_12345.jsonl"],
			traceSummaries: [
				{
					traceId: "trace-1",
					persona: "planner",
					owner: "anicolao",
					repo: "overseer",
					issueNumber: 9,
					eventName: "issues",
					sender: "alice",
					iterationCount: 2,
					outcome: "finalized",
					keyEvents: [
						"iteration 1 | status=in_progress | next=Inspect docs | actions=run_ro_shell",
					],
					sessionLogPath: "/tmp/run-12345/session_planner_1.log",
				},
			],
			persistenceBackstop: {
				metadataPath: "/tmp/run-12345/metadata.json",
				metadata: {
					issue_number: 9,
					target_branch: "bot/issue-9",
				},
			},
		});

		expect(markdown).toContain("# Run 12345 Inspection");
		expect(markdown).toContain("## Persona Flows");
		expect(markdown).toContain("### planner");
		expect(markdown).toContain("## Persistence Backstop");
		expect(markdown).toContain("## Artifact Inventory");
	});
});
