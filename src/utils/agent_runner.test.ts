import { describe, expect, it } from "vitest";
import type { AgentAction } from "./agent_protocol.js";
import { AgentRunner } from "./agent_runner.js";
import type { ShellService } from "./shell.js";

describe("AgentRunner", () => {
	const makeFakeShell = (
		executeActions: (actions: AgentAction[]) => Promise<string>,
	): ShellService =>
		({
			async executeActions(actions: AgentAction[]) {
				return executeActions(actions);
			},
		}) as unknown as ShellService;

	it("executes marker-based actions and returns the final response", async () => {
		const responses = [
			`
PLAN:
Inspect root.

NEXT_STEP:
Inspect root.

ACTIONS:
\`\`\`json
[
  { "type": "run_ro_shell", "command": "printf 'hello'" },
  { "type": "run_shell", "command": "printf 'world'" }
]
\`\`\`

TASK_STATUS:
in_progress
`,
			`
PLAN:
Done.

NEXT_STEP:
Finished.

ACTIONS:
[]

TASK_STATUS:
done

FINAL_RESPONSE:
Verified the repository root and completed the task.
`,
		];
		const sentMessages: string[] = [];

		const gemini = {
			startChat() {
				return {
					async sendMessage(message: string) {
						sentMessages.push(message);
						const next = responses.shift();
						if (!next) {
							throw new Error("No more responses queued");
						}
						return { text: next, response: { text: () => next } };
					},
				};
			},
		};

		const shell = makeFakeShell(async (actions) =>
			actions
				.filter(
					(
						action,
					): action is Extract<
						AgentAction,
						{ type: "run_shell" | "run_ro_shell" }
					> => action.type === "run_shell" || action.type === "run_ro_shell",
				)
				.map(
					(action) =>
						`\n--- EXECUTING: ${action.command} ---\nSTDOUT:\n${action.command.replace("printf ", "").replaceAll("'", "")}\nEXIT CODE: 0\n`,
				)
				.join(""),
		);

		const runner = new AgentRunner(shell);
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			5,
			{
				shellAccess: "read_write",
			},
		);

		expect(result.finalResponse).toBe(
			"Verified the repository root and completed the task.",
		);
		expect(result.log).toContain("hello");
		expect(result.log).toContain("world");
		expect(result.log).toContain("[COMMAND: printf 'hello']");
		expect(result.log).toContain("[COMMAND: printf 'world']");
		expect(sentMessages).toHaveLength(2);
		expect(sentMessages[1]).toContain("MOST RECENT PLAN:");
		expect(sentMessages[1]).toContain("- Inspect root.");
	});

	it("executes persist_work actions", async () => {
		const responses = [
			`
PLAN:
Persist.

NEXT_STEP:
Persist.

ACTIONS:
[{"type": "persist_work"}]

TASK_STATUS:
in_progress
`,
			`
PLAN:
Done.

NEXT_STEP:
Done.

ACTIONS:
[]

TASK_STATUS:
done

FINAL_RESPONSE:
Persisted successfully.
`,
		];

		const gemini = {
			startChat() {
				return {
					async sendMessage() {
						const next = responses.shift();
						return { text: next, response: { text: () => next } };
					},
				};
			},
		};

		const runner = new AgentRunner(makeFakeShell(async () => ""));
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			5,
			{
				persistWork: async () => ({
					ok: true,
					branch: "bot/issue-35",
					commit_sha: "abc123",
					changed_files: ["file.txt"],
					message: "Persisted.",
				}),
			},
		);

		expect(result.log).toContain("--- PERSIST WORK ---");
		expect(result.log).toContain('"commit_sha": "abc123"');
	});

	it("rejects run_shell for read-only personas", async () => {
		const responses = [
			`
PLAN:
Write.

NEXT_STEP:
Write.

ACTIONS:
[{"type": "run_shell", "command": "touch file"}]

TASK_STATUS:
in_progress
`,
			`
PLAN:
Stop.

NEXT_STEP:
Stop.

ACTIONS:
[]

TASK_STATUS:
done

FINAL_RESPONSE:
Stopped.
`,
		];

		const gemini = {
			startChat() {
				return {
					async sendMessage() {
						const next = responses.shift();
						return { text: next, response: { text: () => next } };
					},
				};
			},
		};

		const runner = new AgentRunner(makeFakeShell(async () => ""));
		const result = await runner.runAutonomousLoop(
			gemini as never,
			"System instruction",
			"Initial message",
			5,
			{
				shellAccess: "read_only",
			},
		);

		expect(result.log).toContain("run_shell_not_available");
	});
});
