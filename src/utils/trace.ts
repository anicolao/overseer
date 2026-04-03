import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface TraceContext {
	traceId: string;
	persona: string;
	owner: string;
	repo: string;
	issueNumber: number;
	runId?: string;
	eventName?: string;
	sender?: string;
	commentUrl?: string;
	senderPersona?: string;
}

const traceStorage = new AsyncLocalStorage<TraceContext>();

let fetchInstrumentationInstalled = false;
let fetchCallSequence = 0;
let traceJsonlPathInitialized = false;

function getTraceJsonlPath(): string {
	return (
		process.env.TRACE_JSONL_PATH ||
		`trace_${process.env.GITHUB_RUN_ID || "local"}.jsonl`
	);
}

function ensureTraceJsonlParentDir() {
	if (traceJsonlPathInitialized) {
		return;
	}

	traceJsonlPathInitialized = true;
	mkdirSync(dirname(getTraceJsonlPath()), { recursive: true });
}

export function makeTraceId(parts: {
	runId?: string;
	persona: string;
	issueNumber: number;
}): string {
	const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
	return [
		parts.runId || "local",
		parts.persona,
		`issue-${parts.issueNumber}`,
		timestamp,
	].join(":");
}

export function runWithTraceContext<T>(
	context: TraceContext,
	fn: () => Promise<T>,
): Promise<T> {
	return traceStorage.run(context, fn);
}

export function getCurrentTraceContext(): TraceContext | undefined {
	return traceStorage.getStore();
}

export function textStats(text: string, previewLength: number = 120) {
	return {
		chars: text.length,
		lines: text.length === 0 ? 0 : text.split(/\r?\n/).length,
		approxTokens: Math.ceil(text.length / 4),
		sha256_12: createHash("sha256").update(text).digest("hex").slice(0, 12),
		preview: text.slice(0, previewLength).replaceAll(/\s+/g, " ").trim(),
	};
}

export function describeContent(content: unknown) {
	if (typeof content === "string") {
		return {
			type: "string",
			...textStats(content),
		};
	}

	if (Array.isArray(content)) {
		const json = safeJsonStringify(content);
		return {
			type: "array",
			items: content.length,
			...textStats(json),
		};
	}

	if (content && typeof content === "object") {
		const json = safeJsonStringify(content);
		return {
			type: "object",
			...textStats(json),
		};
	}

	return {
		type: typeof content,
		value: content === undefined ? "undefined" : String(content),
	};
}

export function serializeError(error: unknown, depth: number = 0): unknown {
	if (depth > 3) {
		return "[error depth limit reached]";
	}

	if (error instanceof Error) {
		const maybeError = error as Error & {
			status?: number;
			statusText?: string;
			code?: string | number;
			errno?: string | number;
			type?: string;
			cause?: unknown;
		};

		return {
			name: error.name,
			message: error.message,
			stack: error.stack?.split("\n").slice(0, 8),
			status: maybeError.status,
			statusText: maybeError.statusText,
			code: maybeError.code,
			errno: maybeError.errno,
			type: maybeError.type,
			cause: maybeError.cause
				? serializeError(maybeError.cause, depth + 1)
				: undefined,
		};
	}

	if (typeof error === "object" && error !== null) {
		const record = error as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(record).map(([key, value]) => [
				key,
				key === "cause" ? serializeError(value, depth + 1) : value,
			]),
		);
	}

	return error;
}

export function logTrace(
	event: string,
	data: Record<string, unknown> = {},
	context?: Partial<TraceContext>,
) {
	const activeContext = getCurrentTraceContext();
	const payload = {
		ts: new Date().toISOString(),
		event,
		traceId: context?.traceId || activeContext?.traceId,
		persona: context?.persona || activeContext?.persona,
		owner: context?.owner || activeContext?.owner,
		repo: context?.repo || activeContext?.repo,
		issueNumber: context?.issueNumber || activeContext?.issueNumber,
		runId: context?.runId || activeContext?.runId,
		eventName: context?.eventName || activeContext?.eventName,
		sender: context?.sender || activeContext?.sender,
		commentUrl: context?.commentUrl || activeContext?.commentUrl,
		senderPersona: context?.senderPersona || activeContext?.senderPersona,
		...data,
	};

	const serializedPayload = safeJsonStringify(payload);
	console.log(`[TRACE] ${serializedPayload}`);

	try {
		ensureTraceJsonlParentDir();
		appendFileSync(getTraceJsonlPath(), `${serializedPayload}\n`, "utf8");
	} catch (error) {
		console.error(
			`[TRACE_WRITE_ERROR] ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function installFetchInstrumentation() {
	if (fetchInstrumentationInstalled || typeof globalThis.fetch !== "function") {
		return;
	}

	fetchInstrumentationInstalled = true;
	const originalFetch = globalThis.fetch.bind(globalThis);

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = resolveUrl(input);
		const method = init?.method || inferMethod(input) || "GET";
		const fetchCallId = ++fetchCallSequence;
		const startedAt = Date.now();
		const isGeminiRequest = url.includes("generativelanguage.googleapis.com");

		let requestBody: string | undefined;
		if (isGeminiRequest && init?.body) {
			if (typeof init.body === "string") {
				requestBody = init.body;
			} else {
				requestBody = "[non-string request body]";
			}
		}

		if (isGeminiRequest) {
			logTrace("fetch.begin", {
				fetchCallId,
				url,
				method,
				requestBody,
				hasAbortSignal: Boolean(init?.signal),
				signalAborted: init?.signal?.aborted || false,
			});
		}

		try {
			const response = await originalFetch(input, init);
			if (isGeminiRequest) {
				const responseClone = response.clone();
				let responseBody: string | undefined;
				try {
					responseBody = await responseClone.text();
				} catch (e) {
					responseBody = `[failed to read response body: ${e instanceof Error ? e.message : String(e)}]`;
				}

				logTrace("fetch.response", {
					fetchCallId,
					url,
					method,
					durationMs: Date.now() - startedAt,
					status: response.status,
					statusText: response.statusText,
					responseBody,
					ok: response.ok,
					retryAfter: response.headers.get("retry-after"),
					contentType: response.headers.get("content-type"),
					contentLength: response.headers.get("content-length"),
					xRequestId:
						response.headers.get("x-request-id") ||
						response.headers.get("x-guploader-uploadid"),
				});
			}
			return response;
		} catch (error) {
			if (isGeminiRequest) {
				logTrace("fetch.error", {
					fetchCallId,
					url,
					method,
					durationMs: Date.now() - startedAt,
					error: serializeError(error),
				});
			}
			throw error;
		}
	}) as typeof fetch;
}

function resolveUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.toString();
	}
	return input.url;
}

function inferMethod(input: RequestInfo | URL): string | undefined {
	if (
		typeof input === "object" &&
		!(input instanceof URL) &&
		"method" in input
	) {
		return input.method;
	}
	return undefined;
}

function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return JSON.stringify(String(value));
	}
}
