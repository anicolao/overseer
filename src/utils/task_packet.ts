import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { extractDirectedTask } from "./persona_helper.js";

export interface TaskPacket {
	rawBody: string;
	directedTask: string;
	hasStructuredHandoff: boolean;
	handoffType?: "architect" | "planner" | "developer";
	taskId?: string;
	designFile?: string;
	designApprovalStatus?: string;
	planFile?: string;
	filesToRead: string[];
	currentStep?: string;
	smallestUsefulIncrement?: string;
	stopAfter?: string;
	humanCorrection?: string;
	taskSummary: string;
	doneWhen?: string;
	progressEvidence: string[];
	verificationCommands: string[];
	likelyNextStep?: string;
	supplementalContext?: string;
	missingFiles: string[];
}

type StructuredTaskFields = {
	taskId?: string;
	designFile?: string;
	designApprovalStatus?: string;
	planFile?: string;
	filesToRead: string[];
	currentStep?: string;
	smallestUsefulIncrement?: string;
	stopAfter?: string;
	humanCorrection?: string;
	taskSummary?: string;
	doneWhen?: string;
	progressEvidence: string[];
	verificationCommands: string[];
	likelyNextStep?: string;
};

export function parseTaskPacket(body: string): TaskPacket {
	const directedTask = extractDirectedTask(body);
	const handoffMatch = findStructuredHandoffMarker(directedTask);
	if (!handoffMatch) {
		return {
			rawBody: body,
			directedTask,
			hasStructuredHandoff: false,
			filesToRead: [],
			humanCorrection: undefined,
			taskSummary: directedTask,
			progressEvidence: [],
			verificationCommands: [],
			missingFiles: [],
		};
	}

	const supplementalContext = directedTask.slice(0, handoffMatch.index).trim();
	const structuredBlock = directedTask
		.slice(handoffMatch.index + handoffMatch.marker.length)
		.trim();
	const parsed = parseStructuredTaskFields(structuredBlock);
	const filesToRead = Array.from(
		new Set(
			[parsed.designFile, parsed.planFile, ...parsed.filesToRead]
				.map(normalizeOptionalValue)
				.filter((value): value is string => Boolean(value)),
		),
	);
	const taskSummary =
		normalizeOptionalValue(parsed.taskSummary) ||
		supplementalContext ||
		directedTask;
	const missingFiles = filesToRead.filter((path) => !pathExistsInRepo(path));

	return {
		rawBody: body,
		directedTask,
		hasStructuredHandoff: true,
		handoffType: handoffMatch.handoffType,
		taskId: normalizeOptionalValue(parsed.taskId),
		designFile: normalizeOptionalValue(parsed.designFile),
		designApprovalStatus: normalizeOptionalValue(parsed.designApprovalStatus),
		planFile: normalizeOptionalValue(parsed.planFile),
		filesToRead,
		currentStep: normalizeOptionalValue(parsed.currentStep),
		smallestUsefulIncrement: normalizeOptionalValue(
			parsed.smallestUsefulIncrement,
		),
		stopAfter: normalizeOptionalValue(parsed.stopAfter),
		humanCorrection: normalizeOptionalValue(parsed.humanCorrection),
		taskSummary,
		doneWhen: normalizeOptionalValue(parsed.doneWhen),
		progressEvidence: parsed.progressEvidence
			.map((value) => value.trim())
			.filter(Boolean),
		verificationCommands: parsed.verificationCommands
			.map((command) => command.trim())
			.filter(Boolean),
		likelyNextStep: normalizeOptionalValue(parsed.likelyNextStep),
		supplementalContext: supplementalContext || undefined,
		missingFiles,
	};
}

export function renderTaskPacketForPrompt(packet: TaskPacket): string {
	const lines = [
		"CANONICAL TASK PACKET:",
		`- Structured handoff: ${packet.hasStructuredHandoff ? "yes" : "no"}`,
		`- Handoff Type: ${packet.handoffType || "none"}`,
		`- Task ID: ${packet.taskId || "none"}`,
		`- Design File: ${packet.designFile || "none"}`,
		`- Design Approval Status: ${packet.designApprovalStatus || "none"}`,
		`- Plan File: ${packet.planFile || "none"}`,
		`- Files To Read: ${packet.filesToRead.length > 0 ? packet.filesToRead.join(", ") : "none"}`,
		`- Current Step: ${packet.currentStep || "none"}`,
		`- Smallest Useful Increment: ${packet.smallestUsefulIncrement || "none"}`,
		`- Stop After: ${packet.stopAfter || "none"}`,
		`- Human Correction: ${packet.humanCorrection || "none"}`,
		`- Task Summary: ${packet.taskSummary}`,
		`- Done When: ${packet.doneWhen || "none"}`,
		`- Progress Evidence: ${
			packet.progressEvidence.length > 0
				? packet.progressEvidence.join(" | ")
				: "none"
		}`,
		`- Verification: ${
			packet.verificationCommands.length > 0
				? packet.verificationCommands.join(" | ")
				: "none"
		}`,
		`- Missing Files: ${
			packet.missingFiles.length > 0 ? packet.missingFiles.join(", ") : "none"
		}`,
		`- Likely Next Step: ${packet.likelyNextStep || "none"}`,
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
		progressEvidence: [],
		verificationCommands: [],
	};
	const lines = block.split(/\r?\n/);
	let activeListKey:
		| "filesToRead"
		| "progressEvidence"
		| "verificationCommands"
		| null = null;
	let activeScalarKey:
		| "currentStep"
		| "smallestUsefulIncrement"
		| "stopAfter"
		| "taskSummary"
		| "doneWhen"
		| "likelyNextStep"
		| null = null;

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
			/^(Task ID|Design File|Design Approval Status|Plan File|Files To Read|Current Step|Smallest Useful Increment|Stop After|Human Correction|Task Summary|Done When|Progress Evidence|Verification|Likely Next Step):\s*(.*)$/i,
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
			if (rawKey === "design file") {
				result.designFile = rawValue.trim();
				continue;
			}
			if (rawKey === "design approval status") {
				result.designApprovalStatus = rawValue.trim();
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
			if (rawKey === "current step") {
				result.currentStep = rawValue.trim();
				activeScalarKey = "currentStep";
				continue;
			}
			if (rawKey === "smallest useful increment") {
				result.smallestUsefulIncrement = rawValue.trim();
				activeScalarKey = "smallestUsefulIncrement";
				continue;
			}
			if (rawKey === "stop after") {
				result.stopAfter = rawValue.trim();
				activeScalarKey = "stopAfter";
				continue;
			}
			if (rawKey === "human correction") {
				result.humanCorrection = rawValue.trim();
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
			if (rawKey === "progress evidence") {
				const value = normalizeOptionalValue(rawValue);
				if (value) {
					result.progressEvidence.push(value);
				}
				activeListKey =
					rawValue.trim().length === 0 ? "progressEvidence" : null;
				continue;
			}
			if (rawKey === "verification") {
				const value = normalizeOptionalValue(rawValue);
				if (value) {
					result.verificationCommands.push(value);
				}
				activeListKey =
					rawValue.trim().length === 0 ? "verificationCommands" : null;
				continue;
			}
			if (rawKey === "likely next step") {
				result.likelyNextStep = rawValue.trim();
				activeScalarKey = "likelyNextStep";
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
	result.progressEvidence = Array.from(
		new Set(
			result.progressEvidence.map((value) => value.trim()).filter(Boolean),
		),
	);
	result.verificationCommands = Array.from(
		new Set(
			result.verificationCommands.map((value) => value.trim()).filter(Boolean),
		),
	);
	return result;
}

function findStructuredHandoffMarker(directedTask: string): {
	marker: string;
	index: number;
	handoffType: "architect" | "planner" | "developer";
} | null {
	const candidates = [
		{
			marker: "Architect Task:",
			handoffType: "architect" as const,
		},
		{
			marker: "Planner Task:",
			handoffType: "planner" as const,
		},
		{
			marker: "Developer Task:",
			handoffType: "developer" as const,
		},
	]
		.map((candidate) => ({
			...candidate,
			index: directedTask.indexOf(candidate.marker),
		}))
		.filter((candidate) => candidate.index >= 0)
		.sort((left, right) => left.index - right.index);

	return candidates[0] || null;
}

function splitFilesToRead(value: string): string[] {
	const normalized = normalizeOptionalValue(value);
	if (!normalized) {
		return [];
	}
	return normalized
		.split(",")
		.map((entry) => normalizePathReference(entry))
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

function normalizePathReference(value: string): string {
	const trimmed = value.trim();
	const match = trimmed.match(/^([A-Za-z0-9._/-]+\/?)/);
	return match?.[1]?.trim() || trimmed;
}

function pathExistsInRepo(relativePath: string): boolean {
	const normalizedPath = relativePath.replace(/\/+$/, "");
	if (!normalizedPath) {
		return false;
	}
	return existsSync(resolve(process.cwd(), normalizedPath));
}

export function validateTaskPacketForExecution(packet: TaskPacket): {
	ok: boolean;
	missingFiles: string[];
	message?: string;
} {
	if (!packet.hasStructuredHandoff) {
		return { ok: true, missingFiles: [] };
	}

	const missingFiles = packet.missingFiles.filter((path) => {
		if (
			packet.handoffType === "architect" &&
			packet.designFile === path &&
			packet.designApprovalStatus === "missing"
		) {
			return false;
		}
		return true;
	});

	if (missingFiles.length === 0) {
		return { ok: true, missingFiles: [] };
	}

	return {
		ok: false,
		missingFiles,
		message: `Task packet references files that do not exist in the current repository state: ${missingFiles.join(", ")}. The design or plan does not match the source and must be repaired before this task can continue.`,
	};
}
