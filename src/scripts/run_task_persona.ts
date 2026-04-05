import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { getBotOrThrow, loadBotRegistry } from "../bots/bot_config.js";
import { TaskPersona } from "../personas/task_persona.js";
import { GeminiService } from "../utils/gemini.js";
import { PersistenceService } from "../utils/persistence.js";

loadDotenv();

interface CliOptions {
	botId: string;
	taskFile: string;
	issueNumber: number;
	backend: "sdk" | "cli";
}

export function parseArgs(args: string[]): CliOptions {
	let botId = "";
	let taskFile = "";
	let issueNumber = 999999;
	let backend: "sdk" | "cli" = "sdk";

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printUsageAndExit(0);
		}
		if (arg === "--bot") {
			botId = requireValue(args[++index], "--bot");
			continue;
		}
		if (arg === "--task-file") {
			taskFile = requireValue(args[++index], "--task-file");
			continue;
		}
		if (arg === "--issue") {
			issueNumber = Number.parseInt(requireValue(args[++index], "--issue"), 10);
			if (!Number.isFinite(issueNumber) || issueNumber <= 0) {
				throw new Error(`Invalid --issue value: ${issueNumber}`);
			}
			continue;
		}
		if (arg === "--backend") {
			const value = requireValue(args[++index], "--backend");
			if (value !== "sdk" && value !== "cli") {
				throw new Error(`Invalid --backend value: ${value}`);
			}
			backend = value;
			continue;
		}
		throw new Error(`Unknown option: ${arg}`);
	}

	if (!botId) {
		throw new Error("Missing required option: --bot");
	}
	if (!taskFile) {
		throw new Error("Missing required option: --task-file");
	}

	return {
		botId,
		taskFile: resolve(taskFile),
		issueNumber,
		backend,
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
			"# run_task_persona",
			"",
			"Run a task persona directly against either the SDK loop or Gemini CLI backend.",
			"",
			"## Usage",
			"",
			"- `npm run persona:run -- --bot developer-tester --task-file tmp/task.md`",
			"- `npm run persona:run -- --bot developer-tester --task-file tmp/task.md --backend cli`",
			"- `npm run persona:run -- --bot planner --task-file tmp/task.md --issue 123`",
			"",
		].join("\n"),
	);
	process.exit(exitCode);
}

async function main(): Promise<void> {
	const { botId, taskFile, issueNumber, backend } = parseArgs(
		process.argv.slice(2),
	);
	const taskBody = readFileSync(taskFile, "utf8");
	const registry = loadBotRegistry();
	const bot = getBotOrThrow(registry, botId);
	const geminiApiKey =
		process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
	const gemini = new GeminiService(geminiApiKey);
	const persistence = new PersistenceService();
	const previousBackend = process.env.TASK_PERSONA_BACKEND;
	const previousBotAllowlist = process.env.TASK_PERSONA_CLI_BOTS;

	if (backend === "cli") {
		process.env.TASK_PERSONA_BACKEND = "gemini_cli";
		process.env.TASK_PERSONA_CLI_BOTS = botId;
	} else {
		delete process.env.TASK_PERSONA_BACKEND;
		delete process.env.TASK_PERSONA_CLI_BOTS;
	}

	try {
		const persona = new TaskPersona(bot, gemini, persistence);
		const result = await persona.handleTask(
			"anicolao",
			"overseer",
			issueNumber,
			taskBody,
		);
		process.stdout.write(
			`${JSON.stringify(
				{
					backend,
					botId,
					issueNumber,
					taskFile,
					result,
				},
				null,
				2,
			)}\n`,
		);
	} finally {
		if (previousBackend === undefined) {
			delete process.env.TASK_PERSONA_BACKEND;
		} else {
			process.env.TASK_PERSONA_BACKEND = previousBackend;
		}
		if (previousBotAllowlist === undefined) {
			delete process.env.TASK_PERSONA_CLI_BOTS;
		} else {
			process.env.TASK_PERSONA_CLI_BOTS = previousBotAllowlist;
		}
	}
}

const isMainModule =
	process.argv[1] !== undefined &&
	fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
