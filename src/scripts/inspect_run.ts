import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface CliOptions {
	runId: string;
	artifactsDir: string;
	outputPath?: string;
	skipDownload: boolean;
}

interface TraceEventRecord {
	ts?: string;
	event?: string;
	traceId?: string;
	persona?: string;
	owner?: string;
	repo?: string;
	issueNumber?: number;
	eventName?: string;
	sender?: string;
	iteration?: number;
	nextStep?: string;
	taskStatus?: string;
	actionTypes?: string[];
	error?: string;
	finalResponse?: {
		preview?: string;
	};
	log?: {
		preview?: string;
	};
}

interface TraceSummary {
	traceId: string;
	persona: string;
	owner?: string;
	repo?: string;
	issueNumber?: number;
	eventName?: string;
	sender?: string;
	iterationCount: number;
	outcome: string;
	keyEvents: string[];
	sessionLogPath?: string;
}

interface PersistenceBackstopSummary {
	metadataPath: string;
	commentPath?: string;
	changedPathsPath?: string;
	metadata: Record<string, unknown>;
}

export function parseArgs(args: string[]): CliOptions {
	let runId = "";
	let artifactsDir = "";
	let outputPath: string | undefined;
	let skipDownload = false;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--artifacts-dir") {
			artifactsDir = requireValue(args[++index], "--artifacts-dir");
			continue;
		}
		if (arg === "--out") {
			outputPath = requireValue(args[++index], "--out");
			continue;
		}
		if (arg === "--skip-download") {
			skipDownload = true;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printUsageAndExit(0);
		}
		if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		}
		if (!runId) {
			runId = arg;
			continue;
		}
		throw new Error(`Unexpected positional argument: ${arg}`);
	}

	if (!runId) {
		throw new Error(
			"Usage: npm run runs:inspect -- <run-id> [--artifacts-dir DIR] [--out FILE] [--skip-download]",
		);
	}

	const resolvedArtifactsDir = resolve(
		artifactsDir || `.artifacts/run-${runId}`,
	);
	return {
		runId,
		artifactsDir: resolvedArtifactsDir,
		outputPath: outputPath ? resolve(outputPath) : undefined,
		skipDownload,
	};
}

function requireValue(value: string | undefined, flag: string): string {
	if (!value) {
		throw new Error(`Expected a value after ${flag}`);
	}
	return value;
}

function printUsageAndExit(exitCode: number): never {
	process.stdout.write(
		[
			"# inspect_run",
			"",
			"Download GitHub Actions artifacts for a run and build a markdown inspection report.",
			"",
			"## Usage",
			"",
			"- `npm run runs:inspect -- <run-id>`",
			"- `npm run runs:inspect -- <run-id> --skip-download`",
			"- `npm run runs:inspect -- <run-id> --artifacts-dir .artifacts/custom --out run.md`",
			"",
		].join("\n"),
	);
	process.exit(exitCode);
}

function ensureGhAvailable(): void {
	try {
		execFileSync("gh", ["--version"], { stdio: "ignore" });
	} catch (error) {
		throw new Error(
			`GitHub CLI \`gh\` is required for artifact download: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

function downloadArtifacts(runId: string, artifactsDir: string): void {
	ensureGhAvailable();
	mkdirSync(artifactsDir, { recursive: true });
	execFileSync("gh", ["run", "download", runId, "--dir", artifactsDir], {
		stdio: "inherit",
	});
}

function listFilesRecursive(rootDir: string): string[] {
	if (!existsSync(rootDir)) {
		return [];
	}

	const results: string[] = [];
	for (const entry of readdirSync(rootDir)) {
		const fullPath = resolve(rootDir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			results.push(...listFilesRecursive(fullPath));
			continue;
		}
		results.push(fullPath);
	}
	return results.sort();
}

function readTraceEvents(files: string[]): TraceEventRecord[] {
	const traceFiles = files.filter((file) => /trace_.*\.jsonl$/.test(file));
	const events: TraceEventRecord[] = [];
	for (const traceFile of traceFiles) {
		const lines = readFileSync(traceFile, "utf8")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);
		for (const line of lines) {
			try {
				events.push(JSON.parse(line) as TraceEventRecord);
			} catch (error) {
				console.warn(
					`Skipping invalid JSONL line in ${traceFile}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}
	}
	return events;
}

export function buildTraceSummaries(
	events: TraceEventRecord[],
	files: string[],
): TraceSummary[] {
	const grouped = new Map<string, TraceEventRecord[]>();
	for (const event of events) {
		if (!event.traceId) {
			continue;
		}
		const existing = grouped.get(event.traceId) || [];
		existing.push(event);
		grouped.set(event.traceId, existing);
	}

	return Array.from(grouped.entries())
		.map(([traceId, traceEvents]) => {
			const first = traceEvents[0];
			const iterationEvents = traceEvents.filter(
				(event) => event.event === "agent.iteration.protocol",
			);
			const protocolErrors = traceEvents
				.filter((event) => event.event === "agent.iteration.protocolError")
				.map((event) => event.error)
				.filter((value): value is string => Boolean(value));
			const finalized = traceEvents.find(
				(event) => event.event === "dispatcher.finalize.begin",
			);
			const loopAbort = traceEvents.find(
				(event) => event.event === "agent.loop.abortedForRepeatedCycles",
			);
			const maxedOut = traceEvents.find(
				(event) => event.event === "agent.loop.maxIterationsReached",
			);
			const sessionLogPath = findMatchingSessionLog(files, first?.persona);
			const keyEvents = iterationEvents.map((event) => {
				const pieces = [
					event.iteration ? `iteration ${event.iteration}` : undefined,
					event.taskStatus ? `status=${event.taskStatus}` : undefined,
					event.nextStep ? `next=${event.nextStep}` : undefined,
					event.actionTypes?.length
						? `actions=${event.actionTypes.join(",")}`
						: "actions=none",
				].filter(Boolean);
				return pieces.join(" | ");
			});

			for (const error of protocolErrors) {
				keyEvents.push(`protocol-error | ${error}`);
			}

			let outcome = "incomplete";
			if (loopAbort) {
				outcome = "aborted-for-loop";
			} else if (maxedOut) {
				outcome = "max-iterations";
			} else if (finalized) {
				outcome = "finalized";
			}

			return {
				traceId,
				persona: first?.persona || "unknown",
				owner: first?.owner,
				repo: first?.repo,
				issueNumber: first?.issueNumber,
				eventName: first?.eventName,
				sender: first?.sender,
				iterationCount: iterationEvents.length,
				outcome,
				keyEvents,
				sessionLogPath,
			};
		})
		.sort((left, right) => left.traceId.localeCompare(right.traceId));
}

function findMatchingSessionLog(
	files: string[],
	persona?: string,
): string | undefined {
	if (!persona) {
		return undefined;
	}
	const normalizedPersona = persona.replaceAll("/", "-");
	return files.find(
		(file) =>
			file.includes(`session_${normalizedPersona}_`) && file.endsWith(".log"),
	);
}

function readPersistenceBackstop(
	files: string[],
): PersistenceBackstopSummary | undefined {
	const metadataPath = files.find((file) => file.endsWith("metadata.json"));
	if (!metadataPath) {
		return undefined;
	}

	const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<
		string,
		unknown
	>;
	return {
		metadataPath,
		commentPath: files.find((file) => file.endsWith("comment.md")),
		changedPathsPath: files.find((file) => file.endsWith("changed-paths.txt")),
		metadata,
	};
}

export function renderMarkdownReport(input: {
	runId: string;
	artifactsDir: string;
	files: string[];
	traceSummaries: TraceSummary[];
	persistenceBackstop?: PersistenceBackstopSummary;
}): string {
	const lines: string[] = [
		`# Run ${input.runId} Inspection`,
		"",
		`- Artifacts directory: \`${input.artifactsDir}\``,
		`- Files discovered: \`${input.files.length}\``,
		`- Trace flows: \`${input.traceSummaries.length}\``,
		`- Persistence backstop artifact: \`${input.persistenceBackstop ? "present" : "absent"}\``,
		"",
	];

	if (input.traceSummaries.length > 0) {
		lines.push("## Persona Flows", "");
		for (const summary of input.traceSummaries) {
			lines.push(`### ${summary.persona}`, "");
			lines.push(
				`- Trace ID: \`${summary.traceId}\``,
				`- Repository: \`${summary.owner || "unknown"}/${summary.repo || "unknown"}\``,
				`- Issue: \`${summary.issueNumber ?? "unknown"}\``,
				`- Event: \`${summary.eventName || "unknown"}\``,
				`- Sender: \`${summary.sender || "unknown"}\``,
				`- Iterations observed: \`${summary.iterationCount}\``,
				`- Outcome: \`${summary.outcome}\``,
			);
			if (summary.sessionLogPath) {
				lines.push(`- Session log: \`${summary.sessionLogPath}\``);
			}
			lines.push("", "#### Key Events", "");
			if (summary.keyEvents.length === 0) {
				lines.push("- No iteration protocol events were found.", "");
			} else {
				for (const event of summary.keyEvents) {
					lines.push(`- ${event}`);
				}
				lines.push("");
			}
		}
	}

	if (input.persistenceBackstop) {
		lines.push("## Persistence Backstop", "");
		for (const [key, value] of Object.entries(
			input.persistenceBackstop.metadata,
		)) {
			lines.push(`- ${key}: \`${String(value)}\``);
		}
		if (input.persistenceBackstop.commentPath) {
			lines.push(
				`- Comment file: \`${input.persistenceBackstop.commentPath}\``,
			);
		}
		if (input.persistenceBackstop.changedPathsPath) {
			lines.push(
				`- Changed paths file: \`${input.persistenceBackstop.changedPathsPath}\``,
			);
		}
		lines.push("");
	}

	lines.push("## Artifact Inventory", "");
	for (const file of input.files) {
		lines.push(`- \`${file}\``);
	}
	lines.push("");

	return `${lines.join("\n")}\n`;
}

function main(): void {
	const options = parseArgs(process.argv.slice(2));
	if (!options.skipDownload) {
		downloadArtifacts(options.runId, options.artifactsDir);
	}

	const files = listFilesRecursive(options.artifactsDir);
	if (files.length === 0) {
		throw new Error(
			`No artifact files were found in ${options.artifactsDir}. Run without --skip-download or check the run id.`,
		);
	}

	const traceEvents = readTraceEvents(files);
	const traceSummaries = buildTraceSummaries(traceEvents, files);
	const persistenceBackstop = readPersistenceBackstop(files);
	const outputPath =
		options.outputPath ||
		resolve(options.artifactsDir, `run-${options.runId}.md`);
	const markdown = renderMarkdownReport({
		runId: options.runId,
		artifactsDir: options.artifactsDir,
		files,
		traceSummaries,
		persistenceBackstop,
	});

	writeFileSync(outputPath, markdown, "utf8");
	process.stdout.write(`${outputPath}\n`);
}

const isMainModule =
	process.argv[1] !== undefined &&
	fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
	try {
		main();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exit(1);
	}
}
