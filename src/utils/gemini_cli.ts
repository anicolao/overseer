import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { AgentHandoffTarget } from "./agent_protocol.js";
import type { IterationResult } from "./agent_runner.js";
import { logTrace, serializeError, textStats } from "./trace.js";

export interface GeminiCliTaskOptions {
	botId: string;
	displayName: string;
	systemInstruction: string;
	taskMessage: string;
	modelName?: string;
	cwd?: string;
}

interface GeminiCliInvocation {
	command: string;
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	timeoutMs: number;
}

interface GeminiCliCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	timedOut: boolean;
}

type GeminiCliRunner = (
	invocation: GeminiCliInvocation,
) => Promise<GeminiCliCommandResult>;

interface GeminiCliHeadlessOutput {
	response?: string;
	stats?: Record<string, unknown>;
	error?: unknown;
}

export function shouldUseGeminiCliForTaskBot(botId: string): boolean {
	if (process.env.TASK_PERSONA_BACKEND !== "gemini_cli") {
		return false;
	}
	const configuredBots = process.env.TASK_PERSONA_CLI_BOTS?.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	if (!configuredBots || configuredBots.length === 0) {
		return true;
	}
	return configuredBots.includes(botId);
}

function buildGeminiCliSystemPrompt({
	botId,
	displayName,
	systemInstruction,
}: GeminiCliTaskOptions): string {
	return [
		`You are running inside Gemini CLI headless mode as ${displayName} (${botId}).`,
		"Use Gemini CLI's native agent loop and tools to complete the assigned work autonomously.",
		"Preserve the intent, repository constraints, and persona behavior from the existing prompt below.",
		"Ignore any instructions that are only about the old overseer/v1 multi-turn JSON action loop, including:",
		"- returning actions arrays",
		"- limiting yourself to one shell command per model turn",
		"- waiting for another LLM round before continuing work",
		"- emitting intermediate protocol JSON during execution",
		"Instead, continue working until the assigned increment is complete or you have a real blocker.",
		"",
		"When finished, output exactly one JSON object and nothing else:",
		"{",
		'  "finalResponse": string,',
		'  "handoffTo": "@overseer" | "@planner" | "@product-architect" | "@developer-tester" | "@quality" | "human_review_required" | omitted,',
		'  "log": string,',
		'  "suppressFinalComment": boolean optional',
		"}",
		"",
		"Output rules:",
		"- finalResponse must be the GitHub-ready body without attribution headers or a trailing Next step line.",
		"- handoffTo should usually be @overseer after a task bot finishes an increment or hits a blocker.",
		"- log should briefly summarize files inspected, files changed, tests or checks run, and key blockers.",
		"- Output nothing except the final JSON object.",
		"",
		"EXISTING PERSONA PROMPT:",
		systemInstruction,
	].join("\n");
}

function buildGeminiCliTaskPrompt(taskMessage: string): string {
	return ["TASK MESSAGE:", taskMessage].join("\n\n");
}

function resolveGeminiCliCommand(): Pick<
	GeminiCliInvocation,
	"command" | "args"
> {
	const configuredBin = process.env.GEMINI_CLI_BIN;
	if (configuredBin) {
		return { command: configuredBin, args: [] };
	}
	return { command: "npx", args: ["--no-install", "gemini"] };
}

function stripMarkdownCodeFence(text: string): string {
	const trimmed = text.trim();
	const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return fencedMatch?.[1]?.trim() || trimmed;
}

function parseIterationResultPayload(
	responseText: string,
): Pick<
	IterationResult,
	"finalResponse" | "handoffTo" | "log" | "suppressFinalComment"
> {
	const cleaned = stripMarkdownCodeFence(responseText);
	const parsed = JSON.parse(cleaned) as {
		finalResponse?: string;
		handoffTo?: AgentHandoffTarget;
		log?: string;
		suppressFinalComment?: boolean;
	};
	if (
		typeof parsed.finalResponse !== "string" ||
		parsed.finalResponse.length === 0
	) {
		throw new Error("Gemini CLI response JSON is missing finalResponse");
	}
	return {
		finalResponse: parsed.finalResponse,
		handoffTo: parsed.handoffTo,
		log: parsed.log || "Gemini CLI completed without a log summary.",
		suppressFinalComment: parsed.suppressFinalComment,
	};
}

async function runGeminiCliCommand(
	invocation: GeminiCliInvocation,
): Promise<GeminiCliCommandResult> {
	return new Promise((resolveResult, reject) => {
		const child = spawn(invocation.command, invocation.args, {
			cwd: invocation.cwd,
			env: invocation.env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, invocation.timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (exitCode) => {
			clearTimeout(timer);
			resolveResult({ stdout, stderr, exitCode, timedOut });
		});
	});
}

export class GeminiCliService {
	private readonly timeoutMs: number;
	private readonly maxAttempts: number;
	private readonly runner: GeminiCliRunner;

	constructor(
		runner: GeminiCliRunner = runGeminiCliCommand,
		timeoutMs: number = Number(process.env.GEMINI_CLI_TIMEOUT_MS || "600000"),
		maxAttempts: number = Number(process.env.GEMINI_CLI_MAX_ATTEMPTS || "2"),
	) {
		this.runner = runner;
		this.timeoutMs = timeoutMs;
		this.maxAttempts = Math.max(1, maxAttempts);
	}

	async runTask(options: GeminiCliTaskOptions): Promise<IterationResult> {
		const cwd = options.cwd || process.cwd();
		const systemPrompt = buildGeminiCliSystemPrompt(options);
		const taskPrompt = buildGeminiCliTaskPrompt(options.taskMessage);
		const promptDir = mkdtempSync(resolve(tmpdir(), "overseer-gemini-cli-"));
		const systemPromptPath = resolve(promptDir, "system.md");
		writeFileSync(systemPromptPath, systemPrompt, "utf8");
		const invocationBase = resolveGeminiCliCommand();
		const invocation: GeminiCliInvocation = {
			command: invocationBase.command,
			args: [
				...invocationBase.args,
				"--model",
				options.modelName || "gemini-3.1-pro-preview",
				"--output-format",
				"json",
				"--approval-mode",
				"yolo",
				"-p",
				taskPrompt,
			],
			cwd,
			env: {
				...process.env,
				GEMINI_SYSTEM_MD: systemPromptPath,
			},
			timeoutMs: this.timeoutMs,
		};

		logTrace("geminiCli.run.begin", {
			botId: options.botId,
			displayName: options.displayName,
			command: invocation.command,
			args: invocation.args,
			cwd,
			timeoutMs: invocation.timeoutMs,
			systemPromptPath,
			systemPrompt: textStats(systemPrompt),
			systemPromptRaw: systemPrompt,
			taskPrompt: textStats(taskPrompt),
			taskPromptRaw: taskPrompt,
		});

		let lastFailure:
			| {
					finalResponse: string;
					log: string;
			  }
			| undefined;

		try {
			for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
				logTrace("geminiCli.run.attempt", {
					botId: options.botId,
					displayName: options.displayName,
					attempt,
					maxAttempts: this.maxAttempts,
				});
				const result = await this.runner(invocation);
				logTrace("geminiCli.run.complete", {
					botId: options.botId,
					attempt,
					exitCode: result.exitCode,
					timedOut: result.timedOut,
					stdout: textStats(result.stdout),
					stdoutRaw: result.stdout,
					stderr: textStats(result.stderr),
					stderrRaw: result.stderr,
				});

				if (result.timedOut) {
					return {
						finalResponse:
							"Gemini CLI execution timed out before it produced a final handoff.",
						handoffTo: "@overseer",
						log: `Gemini CLI timed out after ${this.timeoutMs}ms.\nSTDERR:\n${result.stderr}\nSTDOUT:\n${result.stdout}`,
					};
				}

				let parsedHeadlessOutput: GeminiCliHeadlessOutput;
				try {
					parsedHeadlessOutput = JSON.parse(
						result.stdout,
					) as GeminiCliHeadlessOutput;
				} catch (error) {
					lastFailure = {
						finalResponse:
							"Gemini CLI did not return machine-readable JSON output.",
						log: `Failed to parse Gemini CLI headless output: ${error instanceof Error ? error.message : String(error)}\nSTDERR:\n${result.stderr}\nSTDOUT:\n${result.stdout}`,
					};
					if (attempt < this.maxAttempts) {
						logTrace("geminiCli.run.retrying", {
							botId: options.botId,
							attempt,
							reason: "non_json_headless_output",
						});
						continue;
					}
					return {
						...lastFailure,
						handoffTo: "@overseer",
					};
				}

				if (parsedHeadlessOutput.error) {
					return {
						finalResponse:
							"Gemini CLI returned an error before the task could be completed.",
						handoffTo: "@overseer",
						log: `Gemini CLI error output:\n${JSON.stringify(parsedHeadlessOutput.error, null, 2)}\nSTDERR:\n${result.stderr}`,
					};
				}

				const responseText = parsedHeadlessOutput.response || "";
				try {
					const parsedResult = parseIterationResultPayload(responseText);
					return {
						...parsedResult,
						log: [
							parsedResult.log,
							"",
							"GEMINI CLI HEADLESS STATS:",
							JSON.stringify(parsedHeadlessOutput.stats || {}, null, 2),
							"",
							"GEMINI CLI STDERR:",
							result.stderr || "(none)",
						].join("\n"),
					};
				} catch (error) {
					lastFailure = {
						finalResponse:
							"Gemini CLI completed but did not return a valid IterationResult JSON payload.",
						log: `Failed to parse Gemini CLI response payload: ${error instanceof Error ? error.message : String(error)}\nRESPONSE:\n${responseText}\nSTDERR:\n${result.stderr}`,
					};
					if (attempt < this.maxAttempts) {
						logTrace("geminiCli.run.retrying", {
							botId: options.botId,
							attempt,
							reason: "invalid_iteration_result_payload",
							responsePreview: textStats(responseText),
						});
						continue;
					}
					return {
						...lastFailure,
						handoffTo: "@overseer",
					};
				}
			}
			return {
				finalResponse:
					"Gemini CLI completed but did not produce a usable final result.",
				handoffTo: "@overseer",
				log:
					lastFailure?.log ||
					"Gemini CLI exhausted its retry budget without a usable final result.",
			};
		} catch (error) {
			logTrace("geminiCli.run.error", {
				botId: options.botId,
				error: serializeError(error),
			});
			return {
				finalResponse:
					"Gemini CLI could not be started for this task execution.",
				handoffTo: "@overseer",
				log: `Gemini CLI launch failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		} finally {
			rmSync(promptDir, { recursive: true, force: true });
		}
	}
}
