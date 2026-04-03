import { extractDirectedTask } from "./persona_helper.js";

export interface TaskPacket {
	rawBody: string;
	directedTask: string;
	hasStructuredHandoff: boolean;
	taskId?: string;
	planFile?: string;
	filesToRead: string[];
	taskSummary: string;
	doneWhen?: string;
	verificationCommands: string[];
	supplementalContext?: string;
}

type StructuredTaskFields = {
	taskId?: string;
	planFile?: string;
	filesToRead: string[];
	taskSummary?: string;
	doneWhen?: string;
	verificationCommands: string[];
};

export function parseTaskPacket(body: string): TaskPacket {
	const directedTask = extractDirectedTask(body);
	const marker = "Developer Task:";
	const markerIndex = directedTask.indexOf(marker);
	if (markerIndex < 0) {
		return {
			rawBody: body,
			directedTask,
			hasStructuredHandoff: false,
			filesToRead: [],
			taskSummary: directedTask,
			verificationCommands: [],
		};
	}

	const supplementalContext = directedTask.slice(0, markerIndex).trim();
	const structuredBlock = directedTask
		.slice(markerIndex + marker.length)
		.trim();
	const parsed = parseStructuredTaskFields(structuredBlock);
	const filesToRead = Array.from(
		new Set(
			[parsed.planFile, ...parsed.filesToRead]
				.map(normalizeOptionalValue)
				.filter((value): value is string => Boolean(value)),
		),
	);
	const taskSummary =
		normalizeOptionalValue(parsed.taskSummary) ||
		supplementalContext ||
		directedTask;

	return {
		rawBody: body,
		directedTask,
		hasStructuredHandoff: true,
		taskId: normalizeOptionalValue(parsed.taskId),
		planFile: normalizeOptionalValue(parsed.planFile),
		filesToRead,
		taskSummary,
		doneWhen: normalizeOptionalValue(parsed.doneWhen),
		verificationCommands: parsed.verificationCommands
			.map((command) => command.trim())
			.filter(Boolean),
		supplementalContext: supplementalContext || undefined,
	};
}

export function renderTaskPacketForPrompt(packet: TaskPacket): string {
	const lines = [
		"CANONICAL TASK PACKET:",
		`- Structured handoff: ${packet.hasStructuredHandoff ? "yes" : "no"}`,
		`- Task ID: ${packet.taskId || "none"}`,
		`- Plan File: ${packet.planFile || "none"}`,
		`- Files To Read: ${packet.filesToRead.length > 0 ? packet.filesToRead.join(", ") : "none"}`,
		`- Task Summary: ${packet.taskSummary}`,
		`- Done When: ${packet.doneWhen || "none"}`,
		`- Verification: ${
			packet.verificationCommands.length > 0
				? packet.verificationCommands.join(" | ")
				: "none"
		}`,
	];

	if (packet.supplementalContext) {
		lines.push("", "SUPPLEMENTAL CONTEXT:", packet.supplementalContext);
	}

	lines.push("", "RAW DIRECTED TASK:", packet.directedTask);
	return `${lines.join("\n")}\n`;
}

function parseStructuredTaskFields(block: string): StructuredTaskFields {
	const result: StructuredTaskFields = {
		filesToRead: [],
		verificationCommands: [],
	};
	const lines = block.split(/\r?\n/);
	let activeListKey: "filesToRead" | "verificationCommands" | null = null;
	let activeScalarKey: "taskSummary" | "doneWhen" | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			activeListKey = null;
			activeScalarKey = null;
			continue;
		}

		const listItem = trimmed.match(/^-\s+(.+)$/);
		if (listItem && activeListKey) {
			const value = normalizeOptionalValue(listItem[1]);
			if (value) {
				result[activeListKey].push(value);
			}
			continue;
		}

		const keyMatch = trimmed.match(
			/^(Task ID|Plan File|Files To Read|Task Summary|Done When|Verification):\s*(.*)$/i,
		);
		if (keyMatch) {
			activeListKey = null;
			activeScalarKey = null;
			const rawKey = keyMatch[1]?.toLowerCase();
			const rawValue = keyMatch[2] || "";

			if (rawKey === "task id") {
				result.taskId = rawValue.trim();
				continue;
			}
			if (rawKey === "plan file") {
				result.planFile = rawValue.trim();
				continue;
			}
			if (rawKey === "files to read") {
				const values = splitFilesToRead(rawValue);
				result.filesToRead.push(...values);
				activeListKey = rawValue.trim().length === 0 ? "filesToRead" : null;
				continue;
			}
			if (rawKey === "task summary") {
				result.taskSummary = rawValue.trim();
				activeScalarKey = "taskSummary";
				continue;
			}
			if (rawKey === "done when") {
				result.doneWhen = rawValue.trim();
				activeScalarKey = "doneWhen";
				continue;
			}
			if (rawKey === "verification") {
				const value = normalizeOptionalValue(rawValue);
				if (value) {
					result.verificationCommands.push(value);
				}
				activeListKey =
					rawValue.trim().length === 0 ? "verificationCommands" : null;
			}
			continue;
		}

		if (activeScalarKey) {
			const nextValue = [result[activeScalarKey], trimmed]
				.filter(Boolean)
				.join(" ")
				.trim();
			result[activeScalarKey] = nextValue;
		}
	}

	result.filesToRead = Array.from(new Set(result.filesToRead));
	result.verificationCommands = Array.from(
		new Set(
			result.verificationCommands.map((value) => value.trim()).filter(Boolean),
		),
	);
	return result;
}

function splitFilesToRead(value: string): string[] {
	const normalized = normalizeOptionalValue(value);
	if (!normalized) {
		return [];
	}
	return normalized
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function normalizeOptionalValue(value?: string): string | undefined {
	if (!value) {
		return undefined;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0 || trimmed.toLowerCase() === "none") {
		return undefined;
	}
	return trimmed;
}
