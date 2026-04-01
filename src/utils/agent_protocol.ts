export const AGENT_PROTOCOL_VERSION = "overseer/v1";

export type AgentTaskStatus = "in_progress" | "done";

export interface RunShellAction {
	type: "run_shell";
	command: string;
}

export interface PersistWorkAction {
	type: "persist_work";
}

export type AgentAction = RunShellAction | PersistWorkAction;

export interface AgentProtocolResponse {
	version: typeof AGENT_PROTOCOL_VERSION;
	next_step: string;
	actions: AgentAction[];
	task_status: AgentTaskStatus;
	final_response?: string;
	plan?: string[];
}

export interface ParsedAgentProtocolResponse {
	protocol: AgentProtocolResponse;
	rawJson: string;
}

export const AGENT_PROTOCOL_PROMPT = `
RESPONSE PROTOCOL:
- Return exactly one JSON object and nothing else.
- Use \`"version": "${AGENT_PROTOCOL_VERSION}"\`.
- Always include \`next_step\`, \`actions\`, and \`task_status\`.
- If you need to inspect or modify the repository, respond with \`"task_status": "in_progress"\` and exactly one action.
- Use \`{"type":"run_shell","command":"..."}\` for repository inspection, file edits, and verification commands.
- Use \`{"type":"persist_work"}\` only when your persona is authorized to publish repo changes and you want the dispatcher-owned persistence mechanism to commit and push your work.
- If the task is complete, respond with \`"task_status": "done"\`, \`"actions": []\`, and \`final_response\` containing the concise human-facing summary that should be posted back to GitHub.
- Do not use \`[RUN:command]\`, markdown fences, or prose outside the JSON object.
`;

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

export function buildContinuationMessage(actionOutput: string): string {
	return [
		"ACTION OUTPUT:",
		actionOutput,
		"",
		`Continue the task using protocol "${AGENT_PROTOCOL_VERSION}".`,
		"Return exactly one JSON object.",
	].join("\n");
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
	const taskStatus = parseTaskStatus(record.task_status);
	const actions = parseActions(record.actions);
	const finalResponse = parseOptionalNonEmptyString(
		record.final_response,
		"final_response",
	);
	const plan = parseOptionalPlan(record.plan);

	if (taskStatus === "in_progress" && actions.length !== 1) {
		throw new Error(
			'task_status "in_progress" requires exactly one action in actions[]',
		);
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
			next_step: nextStep,
			actions,
			task_status: taskStatus,
			final_response: finalResponse,
			plan,
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

	throw new Error(
		`actions[${index}].type must be "run_shell" or "persist_work"`,
	);
}

function parseOptionalPlan(value: unknown): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new Error("plan must be an array of strings when provided");
	}

	return value.map((entry, index) =>
		requireNonEmptyString(entry, `plan[${index}]`),
	);
}
