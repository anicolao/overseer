import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_PROTOCOL_VERSION } from "../utils/agent_protocol.js";
import { textStats } from "../utils/trace.js";

export type BotKind = "overseer" | "task";
export type LlmProvider = "gemini";

interface RawBotManifest {
	defaults?: {
		llm?: {
			provider?: string;
			model?: string;
		};
		prompt_files?: string[];
		max_iterations?: number;
	};
	bots?: RawBotDefinition[];
}

interface RawBotDefinition {
	id?: string;
	display_name?: string;
	kind?: string;
	llm?: {
		provider?: string;
		model?: string;
	};
	prompt_files?: string[];
	allow_persist_work?: boolean;
	max_iterations?: number;
}

export interface LoadedPromptAssembly {
	promptFiles: string[];
	promptFileContents: Record<string, string>;
	concatenatedPrompt: string;
}

export interface LoadedBotDefinition {
	id: string;
	displayName: string;
	kind: BotKind;
	llm: {
		provider: LlmProvider;
		model: string;
	};
	allowPersistWork: boolean;
	maxIterations: number;
	prompt: LoadedPromptAssembly;
}

export interface LoadedBotRegistry {
	all: LoadedBotDefinition[];
	byId: Map<string, LoadedBotDefinition>;
}

const BOT_MANIFEST_PATH = "bots.json";

export function loadBotRegistry(
	repoRoot: string = process.cwd(),
): LoadedBotRegistry {
	const manifestPath = resolve(repoRoot, BOT_MANIFEST_PATH);
	const rawManifest = JSON.parse(
		readFileSync(manifestPath, "utf8"),
	) as RawBotManifest;

	if (!Array.isArray(rawManifest.bots) || rawManifest.bots.length === 0) {
		throw new Error("bots.json must define a non-empty bots array");
	}

	const defaults = rawManifest.defaults || {};
	const defaultPromptFiles = defaults.prompt_files || [];
	const defaultProvider = defaults.llm?.provider;
	const defaultModel = defaults.llm?.model;
	const defaultMaxIterations = defaults.max_iterations ?? 50;

	const all = rawManifest.bots.map((rawBot) =>
		loadBotDefinition(repoRoot, rawBot, {
			defaultPromptFiles,
			defaultProvider,
			defaultModel,
			defaultMaxIterations,
		}),
	);

	const duplicateIds = findDuplicates(all.map((bot) => bot.id));
	if (duplicateIds.length > 0) {
		throw new Error(
			`Duplicate bot ids in bots.json: ${duplicateIds.join(", ")}`,
		);
	}

	return {
		all,
		byId: new Map(all.map((bot) => [bot.id, bot])),
	};
}

export function getBotOrThrow(
	registry: LoadedBotRegistry,
	botId: string,
): LoadedBotDefinition {
	const bot = registry.byId.get(botId);
	if (!bot) {
		throw new Error(`Unknown bot id: ${botId}`);
	}
	return bot;
}

function loadBotDefinition(
	repoRoot: string,
	rawBot: RawBotDefinition,
	defaults: {
		defaultPromptFiles: string[];
		defaultProvider?: string;
		defaultModel?: string;
		defaultMaxIterations: number;
	},
): LoadedBotDefinition {
	const id = requireNonEmptyString(rawBot.id, "bot.id");
	const displayName = requireNonEmptyString(
		rawBot.display_name,
		`${id}.display_name`,
	);
	const kind = parseKind(rawBot.kind, id);
	const provider = parseProvider(
		rawBot.llm?.provider || defaults.defaultProvider,
		`${id}.llm.provider`,
	);
	const model = requireNonEmptyString(
		rawBot.llm?.model || defaults.defaultModel,
		`${id}.llm.model`,
	);
	const allowPersistWork = Boolean(rawBot.allow_persist_work);
	const maxIterations = parsePositiveInteger(
		rawBot.max_iterations ?? defaults.defaultMaxIterations,
		`${id}.max_iterations`,
	);
	const promptFiles = [
		...defaults.defaultPromptFiles,
		...(rawBot.prompt_files || []),
	];
	if (promptFiles.length === 0) {
		throw new Error(`${id}.prompt_files must not be empty`);
	}

	return {
		id,
		displayName,
		kind,
		llm: {
			provider,
			model,
		},
		allowPersistWork,
		maxIterations,
		prompt: loadPromptAssembly(repoRoot, promptFiles),
	};
}

function loadPromptAssembly(
	repoRoot: string,
	promptFiles: string[],
): LoadedPromptAssembly {
	const duplicatePromptFiles = findDuplicates(promptFiles);
	if (duplicatePromptFiles.length > 0) {
		throw new Error(
			`Duplicate prompt files are not allowed: ${duplicatePromptFiles.join(", ")}`,
		);
	}

	const promptFileContents: Record<string, string> = {};
	const sections = promptFiles.map((promptFile) => {
		const absolutePath = resolve(repoRoot, promptFile);
		const content = renderPromptTemplate(readFileSync(absolutePath, "utf8"));
		promptFileContents[promptFile] = content;
		return [
			`<!-- BEGIN PROMPT FILE: ${promptFile} -->`,
			content.trimEnd(),
			`<!-- END PROMPT FILE: ${promptFile} -->`,
		].join("\n");
	});

	return {
		promptFiles,
		promptFileContents,
		concatenatedPrompt: `${sections.join("\n\n")}\n`,
	};
}

function renderPromptTemplate(content: string): string {
	return content.replaceAll(
		"{{AGENT_PROTOCOL_VERSION}}",
		AGENT_PROTOCOL_VERSION,
	);
}

function parseKind(value: string | undefined, fieldPrefix: string): BotKind {
	if (value === "overseer" || value === "task") {
		return value;
	}
	throw new Error(`${fieldPrefix}.kind must be "overseer" or "task"`);
}

function parseProvider(
	value: string | undefined,
	fieldName: string,
): LlmProvider {
	if (value === "gemini") {
		return value;
	}
	throw new Error(`${fieldName} must be "gemini"`);
}

function parsePositiveInteger(value: unknown, fieldName: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		throw new Error(`${fieldName} must be a positive integer`);
	}
	return value;
}

function requireNonEmptyString(
	value: string | undefined,
	fieldName: string,
): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${fieldName} must be a non-empty string`);
	}
	return value.trim();
}

function findDuplicates(values: string[]): string[] {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) {
			duplicates.add(value);
		}
		seen.add(value);
	}
	return [...duplicates];
}

export function summarizePromptAssembly(prompt: LoadedPromptAssembly) {
	return {
		promptFiles: prompt.promptFiles,
		promptFileContents: Object.fromEntries(
			Object.entries(prompt.promptFileContents).map(([file, content]) => [
				file,
				{
					stats: textStats(content),
					content,
				},
			]),
		),
		concatenatedPrompt: {
			stats: textStats(prompt.concatenatedPrompt),
			content: prompt.concatenatedPrompt,
		},
	};
}
