import { readFileSync } from "node:fs";
import { basename } from "node:path";

interface TraceEvent {
	ts?: string;
	event?: string;
	traceId?: string;
	persona?: string;
	runId?: string;
	issueNumber?: number;
	owner?: string;
	repo?: string;
	iteration?: number;
	systemInstructionRaw?: string;
	initialMessageRaw?: string;
	inputRaw?: string;
	responseRaw?: string;
	finalResponseRaw?: string;
	nextStep?: string;
	taskStatus?: string;
	actionType?: string;
	actionOutput?: {
		preview?: string;
	};
	error?: string;
	command?: string;
	stdout?: {
		preview?: string;
	};
	stderr?: {
		preview?: string;
	};
}

interface IterationState {
	number: number;
	input?: string;
	response?: string;
	taskStatus?: string;
	nextStep?: string;
	finalResponse?: string;
	actionType?: string;
	actionOutputPreview?: string;
	protocolError?: string;
	shellCommands: string[];
}

interface SessionState {
	traceId: string;
	persona?: string;
	runId?: string;
	issueNumber?: number;
	owner?: string;
	repo?: string;
	startedAt?: string;
	systemInstruction?: string;
	initialMessage?: string;
	iterations: Map<number, IterationState>;
	lastIteration?: number;
}

function usage(): never {
	console.error(
		[
			"Usage:",
			"  npm run trace:conversation -- <trace.jsonl> [--trace-id <id>] [--persona <name>] [--llm-only]",
			"  npx tsx src/scripts/extract_trace_conversation.ts <trace.jsonl> [--trace-id <id>] [--persona <name>] [--llm-only]",
		].join("\n"),
	);
	process.exit(1);
}

function parseArgs(argv: string[]) {
	if (argv.length === 0) {
		usage();
	}

	let filePath = "";
	let traceIdFilter: string | undefined;
	let personaFilter: string | undefined;
	let llmOnly = false;

	for (let index = 0; index < argv.length; index++) {
		const value = argv[index];
		if (value === "--trace-id") {
			traceIdFilter = argv[++index];
			continue;
		}
		if (value === "--persona") {
			personaFilter = argv[++index];
			continue;
		}
		if (value === "--llm-only") {
			llmOnly = true;
			continue;
		}
		if (!filePath) {
			filePath = value;
			continue;
		}
		usage();
	}

	if (!filePath) {
		usage();
	}

	return { filePath, traceIdFilter, personaFilter, llmOnly };
}

function ensureIteration(
	session: SessionState,
	iterationNumber: number,
): IterationState {
	const existing = session.iterations.get(iterationNumber);
	if (existing) {
		return existing;
	}

	const created: IterationState = {
		number: iterationNumber,
		shellCommands: [],
	};
	session.iterations.set(iterationNumber, created);
	return created;
}

function updateSessionMetadata(session: SessionState, event: TraceEvent) {
	session.persona ??= event.persona;
	session.runId ??= event.runId;
	session.issueNumber ??= event.issueNumber;
	session.owner ??= event.owner;
	session.repo ??= event.repo;
	session.startedAt ??= event.ts;
	session.systemInstruction ??= event.systemInstructionRaw;
	session.initialMessage ??= event.initialMessageRaw;
}

function formatBlock(label: string, value?: string) {
	console.log(`${label}:`);
	if (!value) {
		console.log("  <unavailable>");
		console.log("");
		return;
	}

	for (const line of value.split(/\r?\n/)) {
		console.log(`  ${line}`);
	}
	console.log("");
}

function printDirectionalBlock(
	label: string,
	value: string | undefined,
	marker: string,
): boolean {
	if (!value) {
		return false;
	}

	console.log(marker.repeat(80));
	console.log(label);
	console.log(marker.repeat(80));
	console.log(value);
	console.log("");
	return true;
}

function printSession(session: SessionState, llmOnly: boolean) {
	const iterations = [...session.iterations.values()].sort(
		(left, right) => left.number - right.number,
	);
	const hasTraffic =
		Boolean(session.systemInstruction) ||
		Boolean(session.initialMessage) ||
		iterations.some(
			(iteration) => Boolean(iteration.input) || Boolean(iteration.response),
		);

	if (llmOnly && !hasTraffic) {
		return;
	}

	console.log("=".repeat(80));
	console.log(`Trace ID: ${session.traceId}`);
	console.log(`Persona: ${session.persona || "<unknown>"}`);
	console.log(`Run ID: ${session.runId || "<unknown>"}`);
	console.log(`Issue: ${session.issueNumber ?? "<unknown>"}`);
	if (session.owner && session.repo) {
		console.log(`Repo: ${session.owner}/${session.repo}`);
	}
	if (session.startedAt) {
		console.log(`Started: ${session.startedAt}`);
	}
	console.log("");

	const printedSystem = printDirectionalBlock(
		"OUTBOUND TO LLM: SYSTEM INSTRUCTION",
		session.systemInstruction,
		">",
	);
	const printedInitial = printDirectionalBlock(
		"OUTBOUND TO LLM: INITIAL MESSAGE",
		session.initialMessage,
		">",
	);
	if ((printedSystem || printedInitial) && iterations.length > 0) {
		console.log("");
	}
	for (const iteration of iterations) {
		const printedRequest = Boolean(iteration.input);
		const printedResponse = Boolean(iteration.response);
		if (!printedRequest && !printedResponse && llmOnly) {
			continue;
		}

		console.log("-".repeat(80));
		console.log(`Iteration ${iteration.number}`);
		console.log("");
		printDirectionalBlock(
			`OUTBOUND TO LLM: ITERATION ${iteration.number} REQUEST`,
			iteration.input,
			">",
		);
		printDirectionalBlock(
			`INBOUND FROM LLM: ITERATION ${iteration.number} RESPONSE`,
			iteration.response,
			"<",
		);

		if (llmOnly) {
			continue;
		}

		if (
			iteration.taskStatus ||
			iteration.nextStep ||
			iteration.finalResponse ||
			iteration.protocolError
		) {
			console.log("Protocol:");
			if (iteration.taskStatus) {
				console.log(`  task_status: ${iteration.taskStatus}`);
			}
			if (iteration.nextStep) {
				console.log(`  next_step: ${iteration.nextStep}`);
			}
			if (iteration.protocolError) {
				console.log(`  error: ${iteration.protocolError}`);
			}
			console.log("");
			if (iteration.finalResponse) {
				formatBlock("Final Response", iteration.finalResponse);
			}
		}

		if (iteration.actionType || iteration.shellCommands.length > 0) {
			console.log("Actions:");
			if (iteration.actionType) {
				console.log(`  type: ${iteration.actionType}`);
			}
			for (const command of iteration.shellCommands) {
				console.log(`  shell: ${command}`);
			}
			if (iteration.actionOutputPreview) {
				console.log(`  output: ${iteration.actionOutputPreview}`);
			}
			console.log("");
		}
	}
}

function main() {
	const { filePath, traceIdFilter, personaFilter, llmOnly } = parseArgs(
		process.argv.slice(2),
	);
	const sessions = new Map<string, SessionState>();
	const seenLines = new Set<string>();
	const rawLines = readFileSync(filePath, "utf8").split(/\r?\n/);
	let unscopedSessionSequence = 0;
	let currentUnscopedTraceId = "unscoped";

	for (const rawLine of rawLines) {
		const line = rawLine.trim();
		if (!line || seenLines.has(line)) {
			continue;
		}
		seenLines.add(line);

		let event: TraceEvent;
		try {
			event = JSON.parse(line) as TraceEvent;
		} catch {
			continue;
		}

		const traceId = event.traceId
			? event.traceId
			: event.event === "agent.loop.start"
				? `unscoped:${++unscopedSessionSequence}`
				: currentUnscopedTraceId;
		if (!event.traceId) {
			currentUnscopedTraceId = traceId;
		}
		let session = sessions.get(traceId);
		if (!session) {
			session = {
				traceId,
				iterations: new Map<number, IterationState>(),
			};
			sessions.set(traceId, session);
		}

		updateSessionMetadata(session, event);

		if (event.event === "agent.loop.start") {
			session.systemInstruction = event.systemInstructionRaw;
			session.initialMessage = event.initialMessageRaw;
		}

		if (event.iteration !== undefined) {
			session.lastIteration = event.iteration;
			const iteration = ensureIteration(session, event.iteration);
			if (event.event === "agent.iteration.begin") {
				iteration.input = event.inputRaw;
			} else if (event.event === "agent.iteration.response") {
				iteration.response = event.responseRaw;
			} else if (event.event === "agent.iteration.protocol") {
				iteration.taskStatus = event.taskStatus;
				iteration.nextStep = event.nextStep;
				iteration.finalResponse = event.finalResponseRaw;
			} else if (event.event === "agent.iteration.protocolError") {
				iteration.protocolError = event.error;
			} else if (event.event === "agent.iteration.action") {
				iteration.actionType = event.actionType;
				iteration.actionOutputPreview = event.actionOutput?.preview;
			}
		}

		if (
			(event.event === "shell.command.begin" ||
				event.event === "shell.command.success" ||
				event.event === "shell.command.error") &&
			event.command &&
			session.lastIteration !== undefined
		) {
			const iteration = ensureIteration(session, session.lastIteration);
			if (!iteration.shellCommands.includes(event.command)) {
				iteration.shellCommands.push(event.command);
			}
		}
	}

	let filteredSessions = [...sessions.values()];
	if (traceIdFilter) {
		filteredSessions = filteredSessions.filter(
			(session) => session.traceId === traceIdFilter,
		);
	}
	if (personaFilter) {
		filteredSessions = filteredSessions.filter(
			(session) => session.persona === personaFilter,
		);
	}

	filteredSessions.sort((left, right) =>
		(left.startedAt || "").localeCompare(right.startedAt || ""),
	);

	if (filteredSessions.length === 0) {
		console.error(`No matching sessions found in ${basename(filePath)}.`);
		process.exit(1);
	}

	for (const [index, session] of filteredSessions.entries()) {
		if (index > 0) {
			console.log("");
		}
		printSession(session, llmOnly);
	}
}

main();
