import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
	getBotOrThrow,
	type LoadedBotDefinition,
	loadBotRegistry,
} from "../bots/bot_config.js";

export interface CliOptions {
	botId?: string;
}

export function parseArgs(args: string[]): CliOptions {
	if (args.length === 0) {
		return {};
	}

	if (args[0] === "--bot") {
		const botId = args[1];
		if (!botId) {
			throw new Error('Expected a bot id after "--bot"');
		}
		return { botId };
	}

	if (args[0] === "--help" || args[0] === "-h") {
		printUsageAndExit(0);
	}

	if (args[0]?.startsWith("--")) {
		throw new Error(`Unknown option: ${args[0]}`);
	}

	return { botId: args[0] };
}

export function renderBotListMarkdown(bots: LoadedBotDefinition[]): string {
	const lines = [
		"# Bots",
		"",
		"| ID | Name | Kind | Model | Persist | Prompt Files |",
		"| --- | --- | --- | --- | --- | ---: |",
		...bots.map(
			(bot) =>
				`| \`${bot.id}\` | ${bot.displayName} | \`${bot.kind}\` | \`${bot.llm.model}\` | ${bot.allowPersistWork ? "yes" : "no"} | ${bot.prompt.promptFiles.length} |`,
		),
		"",
		"Usage:",
		"",
		"- `npm run bots:inspect`",
		"- `npm run bots:inspect -- <bot-id>`",
		"- `npm run bots:inspect -- --bot <bot-id>`",
	];

	return `${lines.join("\n")}\n`;
}

export function renderBotDetailMarkdown(bot: LoadedBotDefinition): string {
	const lines: string[] = [
		`# ${bot.displayName}`,
		"",
		`- ID: \`${bot.id}\``,
		`- Kind: \`${bot.kind}\``,
		`- Provider: \`${bot.llm.provider}\``,
		`- Model: \`${bot.llm.model}\``,
		`- Persist Work: ${bot.allowPersistWork ? "yes" : "no"}`,
		`- Max Iterations: ${bot.maxIterations}`,
		"",
		"## Prompt Files",
		"",
		...bot.prompt.promptFiles.map((promptFile) => `- \`${promptFile}\``),
		"",
		"## Prompt File Contents",
	];

	for (const promptFile of bot.prompt.promptFiles) {
		const content = bot.prompt.promptFileContents[promptFile] || "";
		lines.push(
			"",
			`### \`${promptFile}\``,
			"",
			"```md",
			content.trimEnd(),
			"```",
		);
	}

	lines.push(
		"",
		"## Concatenated Prompt",
		"",
		"```md",
		bot.prompt.concatenatedPrompt.trimEnd(),
		"```",
	);

	return `${lines.join("\n")}\n`;
}

export function printMarkdown(markdown: string): void {
	const result = spawnSync("glow", ["-p"], {
		input: markdown,
		encoding: "utf8",
		stdio: ["pipe", "inherit", "inherit"],
	});

	if (
		result.error &&
		"code" in result.error &&
		result.error.code === "ENOENT"
	) {
		process.stdout.write(markdown);
		return;
	}

	if (result.status !== 0) {
		process.stdout.write(markdown);
	}
}

function printUsageAndExit(exitCode: number): never {
	const usage = [
		"# inspect_bots",
		"",
		"Inspect the bot manifest and resolved prompts.",
		"",
		"## Usage",
		"",
		"- `npm run bots:inspect`",
		"- `npm run bots:inspect -- <bot-id>`",
		"- `npm run bots:inspect -- --bot <bot-id>`",
	];
	process.stdout.write(`${usage.join("\n")}\n`);
	process.exit(exitCode);
}

function main(): void {
	const { botId } = parseArgs(process.argv.slice(2));
	const registry = loadBotRegistry();
	const markdown = botId
		? renderBotDetailMarkdown(getBotOrThrow(registry, botId))
		: renderBotListMarkdown(registry.all);

	printMarkdown(markdown);
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
