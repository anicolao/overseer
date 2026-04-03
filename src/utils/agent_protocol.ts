export const AGENT_PROTOCOL_VERSION = "overseer/v1";
export const AGENT_HANDOFF_TARGETS = [
	"@overseer",
	"@product-architect",
	"@planner",
	"@developer-tester",
	"@quality",
	"human_review_required",
] as const;

export type AgentTaskStatus = "in_progress" | "done";
export type AgentHandoffTarget = (typeof AGENT_HANDOFF_TARGETS)[number];

export interface RunReadOnlyShellAction {
	type: "run_ro_shell";
	command: string;
}

export interface RunShellAction {
	type: "run_shell";
	command: string;
}

export interface PersistWorkAction {
	type: "persist_work";
}

export type AgentAction =
	| RunReadOnlyShellAction
	| RunShellAction
	| PersistWorkAction;

export interface AgentProtocolResponse {
	version: typeof AGENT_PROTOCOL_VERSION;
	plan: string[];
	next_step: string;
	actions: AgentAction[];
	task_status: AgentTaskStatus;
	final_response?: string;
	github_comment?: string;
	handoff_to?: AgentHandoffTarget;
}

export interface ParsedAgentProtocolResponse {
	protocol: AgentProtocolResponse;
	rawJson: string;
}

export interface ContinuationContext {
	originalTask: string;
	iteration: number;
	previousPlan: string[];
	previousResponseJson: string;
	previousGithubComment?: string;
	actionOutput: string;
}

export const AGENT_PROTOCOL_PROMPT =
	"RESPONSE PROTOCOL:\n" +
	"Work to this workflow on every turn:\n" +
	"1. Keep a concrete plan in mind.\n" +
	"2. Return that plan explicitly following the `PLAN:` marker.\n" +
	"3. State the immediate next step following the `NEXT_STEP:` marker.\n" +
	"4. Either take one or more ordered actions or finish the task.\n" +
	"5. Observe the result and loop.\n" +
	"\n" +
	"Your response MUST follow this structure:\n" +
	"\n" +
	"PLAN:\n" +
	"<your step-by-step plan>\n" +
	"\n" +
	"NEXT_STEP:\n" +
	"<the immediate next step you intend to take>\n" +
	"\n" +
	"ACTIONS:\n" +
	"```json\n" +
	"[\n" +
	'  {"type": "run_ro_shell", "command": "..."},\n' +
	'  {"type": "run_shell", "command": "..."}\n' +
	"]\n" +
	"```\n" +
	"\n" +
	"TASK_STATUS:\n" +
	'<"in_progress" or "done">\n' +
	"\n" +
	"GITHUB_COMMENT:\n" +
	"<optional status update for the issue>\n" +
	"\n" +
	"FINAL_RESPONSE:\n" +
	"<required when task_status is done; concise summary of work>\n" +
	"\n" +
	"HANDOFF_TO:\n" +
	'<optional when task_status is done; e.g., "@planner">\n' +
	"\n" +
	"Rules:\n" +
	"- `ACTIONS` must be a valid JSON array of action objects.\n" +
	'- Available actions: `{"type":"run_ro_shell","command":"..."}`, `{"type":"run_shell","command":"..."}`, and `{"type":"persist_work"}`.\n' +
	'- Use `{"type":"run_ro_shell","command":"..."}` for repository inspection and verification. It runs in a disposable read-only clone. Changes made here will be LOST.\n' +
	'- Use `{"type":"run_shell","command":"..."}` for repository file edits and tool execution in the live checkout.\n' +
	"- Environment state (like the current directory) is persistent between `run_shell` actions within the same turn and across turns.\n" +
	'- Use `{"type":"persist_work"}` to commit and push all changes made via `run_shell` to the issue branch. Your work is not saved until you call this.\n' +
	"- If you set `HANDOFF_TO`, the dispatcher will append the standardized `Next step: ...` line.\n" +
	"- If the task is complete, respond with `TASK_STATUS: done`, an empty `ACTIONS` array, and a `FINAL_RESPONSE`.\n" +
	"\n" +
	"Example in-progress response:\n" +
	"PLAN:\n" +
	"1. Inspect files.\n" +
	"2. Fix bug.\n" +
	"\n" +
	"NEXT_STEP:\n" +
	"Read the relevant files before editing.\n" +
	"\n" +
	"ACTIONS:\n" +
	"```json\n" +
	"[\n" +
	'  {"type": "run_ro_shell", "command": "ls -la"}\n' +
	"]\n" +
	"```\n" +
	"\n" +
	"TASK_STATUS:\n" +
	"in_progress\n";

export function buildProtocolRepairMessage(
	error: string,
	previousResponse: string,
): string {
	return [
		`Your previous response was invalid: ${error}`,
		`Return exactly one JSON object matching protocol "${AGENT_PROTOCOL_VERSION}".`,
		"Do not use markdown fences or any prose outside the JSON object.",
		"Previous response:",
		previousResponse,
	].join("\n\n");
}

export function buildContinuationMessage({
	originalTask,
	iteration,
	previousPlan,
	previousResponseJson,
	previousGithubComment,
	actionOutput,
}: ContinuationContext): string {
	return [
		"ORIGINAL TASK:",
		originalTask,
		"",
		`CURRENT ITERATION: ${iteration}`,
		"",
		"MOST RECENT PLAN:",
		...previousPlan.map((step) => `- ${step}`),
		"",
		"MOST RECENT STRUCTURED RESPONSE:",
		previousResponseJson,
		"",
		...(previousGithubComment
			? ["MOST RECENT GITHUB STATUS COMMENT:", previousGithubComment, ""]
			: []),
		"LATEST ACTION OUTPUT:",
		actionOutput,
		"",
		"Compare the LATEST ACTION OUTPUT against the MOST RECENT PLAN.",
		"If an action yielded the data you need, do not repeat it. Advance to the next step in your plan.",
		"",
		"Continue the same task. Do not restart or reinterpret the assignment.",
		"Use the original task and your most recent structured response to decide the next step.",
		`Continue the task using protocol "${AGENT_PROTOCOL_VERSION}".`,
		"Return exactly one JSON object.",
	].join("\n");
}

export function parseAgentProtocolResponse(
	responseText: string,
): ParsedAgentProtocolResponse {
	const plan = extractMarker(responseText, "PLAN");
	const nextStep = extractMarker(responseText, "NEXT_STEP");
	const taskStatusRaw = extractMarker(responseText, "TASK_STATUS");
	const finalResponse = extractMarker(responseText, "FINAL_RESPONSE");
	const githubComment = extractMarker(responseText, "GITHUB_COMMENT");
	const handoffToRaw = extractMarker(responseText, "HANDOFF_TO");

	const actionsRaw = extractMarker(responseText, "ACTIONS");
	let actions: AgentAction[] = [];
	if (actionsRaw) {
		const jsonMatch = actionsRaw.match(/```json\s*([\s\S]*?)\s*```/i);
		const jsonToParse = jsonMatch ? jsonMatch[1].trim() : actionsRaw.trim();
		try {
			actions = parseActions(JSON.parse(jsonToParse));
		} catch (error) {
			throw new Error(
				`ACTIONS must be a valid JSON array: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	const taskStatus = parseTaskStatus(taskStatusRaw?.trim());
	const handoffTo = parseOptionalHandoffTarget(handoffToRaw?.trim());

	if (!plan) throw new Error("Missing PLAN: marker");
	if (!nextStep) throw new Error("Missing NEXT_STEP: marker");
	if (!taskStatus) throw new Error("Missing TASK_STATUS: marker");

	if (taskStatus === "in_progress" && actions.length === 0) {
		throw new Error('TASK_STATUS "in_progress" requires at least one action');
	}

	if (taskStatus === "done" && !finalResponse) {
		throw new Error('TASK_STATUS "done" requires a FINAL_RESPONSE');
	}

	return {
		rawJson: responseText, // Keeping original for history compatibility
		protocol: {
			version: AGENT_PROTOCOL_VERSION,
			plan: plan.split("\n").filter((line) => line.trim().length > 0),
			next_step: nextStep.trim(),
			actions,
			task_status: taskStatus,
			final_response: finalResponse?.trim(),
			github_comment: githubComment?.trim(),
			handoff_to: handoffTo,
		},
	};
}

function extractMarker(text: string, marker: string): string | undefined {
	const regex = new RegExp(`${marker}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, "i");
	const match = text.match(regex);
	return match ? match[1].trim() : undefined;
}

function parseTaskStatus(value: unknown): AgentTaskStatus {
	if (value === "in_progress" || value === "done") {
		return value;
	}
	throw new Error('task_status must be either "in_progress" or "done"');
}

function parseOptionalHandoffTarget(
	value: unknown,
): AgentHandoffTarget | undefined {
	if (
		value === undefined ||
		value === null ||
		(typeof value === "string" && value.trim() === "")
	) {
		return undefined;
	}
	const handoffTo = (typeof value === "string" ? value : String(value)).trim();
	if (!(AGENT_HANDOFF_TARGETS as readonly string[]).includes(handoffTo)) {
		throw new Error(
			`handoff_to must be one of: ${AGENT_HANDOFF_TARGETS.join(", ")}`,
		);
	}
	return handoffTo as AgentHandoffTarget;
}

function parseActions(value: unknown): AgentAction[] {
	if (!Array.isArray(value)) {
		throw new Error("actions must be an array");
	}

	return value.map((action, index) => parseAction(action, index));
}

function parseAction(value: unknown, index: number): AgentAction {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`actions[${index}] must be an object`);
	}

	const record = value as Record<string, unknown>;
	const type = record.type;
	if (typeof type !== "string") {
		throw new Error(`actions[${index}].type must be a string`);
	}

	if (type === "run_ro_shell") {
		const command = record.command;
		if (typeof command !== "string" || command.trim().length === 0) {
			throw new Error(`actions[${index}].command must be a non-empty string`);
		}
		return {
			type: "run_ro_shell",
			command: command.trim(),
		};
	}

	if (type === "run_shell") {
		const command = record.command;
		if (typeof command !== "string" || command.trim().length === 0) {
			throw new Error(`actions[${index}].command must be a non-empty string`);
		}
		return {
			type: "run_shell",
			command: command.trim(),
		};
	}

	if (type === "persist_work") {
		return {
			type: "persist_work",
		};
	}

	throw new Error(
		`actions[${index}].type must be "run_ro_shell", "run_shell", or "persist_work"`,
	);
}
