import { renderPromptFile } from "./prompt_files.js";

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

export interface PersistQaAction {
	type: "persist_qa";
}

export type AgentAction =
	| RunReadOnlyShellAction
	| RunShellAction
	| PersistWorkAction
	| PersistQaAction;

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
	previousResponseJson: string;
	previousGithubComment?: string;
	actionOutput: string;
	reminder?: string;
}

export function buildProtocolRepairMessage(
	error: string,
	previousResponse: string,
): string {
	return renderPromptFile("prompts/runtime/protocol-repair.md", {
		ERROR: error,
		PREVIOUS_RESPONSE: previousResponse,
		AGENT_PROTOCOL_VERSION,
	});
}

export function buildContinuationMessage({
	originalTask,
	iteration,
	previousResponseJson,
	previousGithubComment,
	actionOutput,
	reminder,
}: ContinuationContext): string {
	const previousGithubCommentSection = previousGithubComment
		? renderPromptFile(
				"prompts/runtime/continuation-github-comment-section.md",
				{
					PREVIOUS_GITHUB_COMMENT: previousGithubComment,
				},
			)
		: "";
	const reminderSection = reminder
		? renderPromptFile("prompts/runtime/continuation-reminder-section.md", {
				REMINDER: reminder,
			})
		: "";

	return renderPromptFile("prompts/runtime/continuation.md", {
		ORIGINAL_TASK: originalTask,
		ITERATION: String(iteration),
		PREVIOUS_RESPONSE_JSON: previousResponseJson,
		PREVIOUS_GITHUB_COMMENT_SECTION: previousGithubCommentSection,
		ACTION_OUTPUT: actionOutput,
		REMINDER_SECTION: reminderSection,
		AGENT_PROTOCOL_VERSION,
	});
}

export function buildLoopRepairMessage(input: {
	originalTask: string;
	iteration: number;
	previousResponseJson: string;
	actionOutput: string;
	repeatedCycleCount: number;
}): string {
	return renderPromptFile("prompts/runtime/loop-repair.md", {
		REPEATED_CYCLE_COUNT: String(input.repeatedCycleCount),
		ORIGINAL_TASK: input.originalTask,
		ITERATION: String(input.iteration),
		PREVIOUS_RESPONSE_JSON: input.previousResponseJson,
		ACTION_OUTPUT: input.actionOutput,
		AGENT_PROTOCOL_VERSION,
	});
}

export function parseAgentProtocolResponse(
	responseText: string,
): ParsedAgentProtocolResponse {
	const rawJson = extractJsonObject(responseText);
	let parsed: unknown;

	try {
		parsed = JSON.parse(rawJson);
	} catch (error) {
		throw new Error(
			`response was not valid JSON: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("top-level JSON value must be an object");
	}

	const record = parsed as Record<string, unknown>;
	const version = requireNonEmptyString(record.version, "version");
	if (version !== AGENT_PROTOCOL_VERSION) {
		throw new Error(
			`version must be "${AGENT_PROTOCOL_VERSION}", received "${version}"`,
		);
	}

	const nextStep = requireNonEmptyString(record.next_step, "next_step");
	const plan = parseRequiredPlan(record.plan);
	const taskStatus = parseTaskStatus(record.task_status);
	const actions = parseActions(record.actions);
	const finalResponse = parseOptionalNonEmptyString(
		record.final_response,
		"final_response",
	);
	const githubComment = parseOptionalNonEmptyString(
		record.github_comment,
		"github_comment",
	);
	const handoffTo = parseOptionalHandoffTarget(record.handoff_to);

	if (taskStatus === "in_progress" && actions.length === 0) {
		throw new Error(
			'task_status "in_progress" requires at least one action in actions[]',
		);
	}
	if (taskStatus !== "done" && handoffTo) {
		throw new Error('handoff_to is only valid when task_status is "done"');
	}

	if (taskStatus === "done") {
		if (actions.length !== 0) {
			throw new Error('task_status "done" requires actions to be empty');
		}
		if (!finalResponse) {
			throw new Error(
				'task_status "done" requires a non-empty final_response string',
			);
		}
	}

	return {
		rawJson,
		protocol: {
			version: AGENT_PROTOCOL_VERSION,
			plan,
			next_step: nextStep,
			actions,
			task_status: taskStatus,
			final_response: finalResponse,
			github_comment: githubComment,
			handoff_to: handoffTo,
		},
	};
}

function extractJsonObject(responseText: string): string {
	const trimmed = responseText.trim();
	if (!trimmed) {
		throw new Error("response was empty");
	}

	const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	if (fencedMatch?.[1]) {
		return fencedMatch[1].trim();
	}

	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		return trimmed;
	}

	const embeddedObject = extractBalancedObject(trimmed);
	if (embeddedObject) {
		return embeddedObject;
	}

	throw new Error("could not find a JSON object in the response");
}

function extractBalancedObject(text: string): string | null {
	let startIndex = -1;
	let depth = 0;
	let inString = false;
	let isEscaped = false;

	for (let index = 0; index < text.length; index++) {
		const char = text[index];
		if (!char) {
			continue;
		}

		if (isEscaped) {
			isEscaped = false;
			continue;
		}

		if (char === "\\") {
			isEscaped = true;
			continue;
		}

		if (char === '"') {
			inString = !inString;
			continue;
		}

		if (inString) {
			continue;
		}

		if (char === "{") {
			if (depth === 0) {
				startIndex = index;
			}
			depth++;
			continue;
		}

		if (char === "}") {
			if (depth === 0) {
				continue;
			}
			depth--;
			if (depth === 0 && startIndex >= 0) {
				return text.slice(startIndex, index + 1);
			}
		}
	}

	return null;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	return value.trim();
}

function parseOptionalNonEmptyString(
	value: unknown,
	fieldName: string,
): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return requireNonEmptyString(value, fieldName);
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
	if (value === undefined) {
		return undefined;
	}
	const handoffTo = requireNonEmptyString(value, "handoff_to");
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
	const type = requireNonEmptyString(record.type, `actions[${index}].type`);
	if (type === "run_ro_shell") {
		return {
			type: "run_ro_shell",
			command: requireNonEmptyString(
				record.command,
				`actions[${index}].command`,
			),
		};
	}

	if (type === "run_shell") {
		return {
			type: "run_shell",
			command: requireNonEmptyString(
				record.command,
				`actions[${index}].command`,
			),
		};
	}

	if (type === "persist_work") {
		return {
			type: "persist_work",
		};
	}

	if (type === "persist_qa") {
		return {
			type: "persist_qa",
		};
	}

	throw new Error(
		`actions[${index}].type must be "run_ro_shell", "run_shell", "persist_work", or "persist_qa"`,
	);
}

function parseRequiredPlan(value: unknown): string[] {
	if (!Array.isArray(value)) {
		throw new Error("plan must be an array of strings");
	}
	if (value.length === 0) {
		throw new Error("plan must contain at least one step");
	}

	return value.map((entry, index) =>
		requireNonEmptyString(entry, `plan[${index}]`),
	);
}
