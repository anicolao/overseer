import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_PROTOCOL_VERSION } from "../utils/agent_protocol.js";
import { loadPromptFile, renderPromptFile } from "../utils/prompt_files.js";
import { textStats } from "../utils/trace.js";

export type BotKind = "overseer" | "task";
export type LlmProvider = "gemini";
export type ShellAccess = "read_only" | "read_write";

interface RawBotManifest {
	defaults?: {
		llm?: {
			provider?: string;
			model?: string;
		};
		prompt_files?: string[];
		max_iterations?: number;
		max_actions_per_turn?: number;
	};
	bots?: RawBotDefinition[];
}

interface RawBotDefinition {
	id?: string;
	display_name?: string;
	kind?: string;
	shell_access?: string;
	llm?: {
		provider?: string;
		model?: string;
	};
	prompt_files?: string[];
	allow_persist_work?: boolean;
	allow_persist_qa?: boolean;
	require_post_persist_verification?: boolean;
	max_iterations?: number;
	max_actions_per_turn?: number;
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
	shellAccess: ShellAccess;
	allowPersistWork: boolean;
	requirePostPersistVerification: boolean;
	maxIterations: number;
	maxActionsPerTurn: number;
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
	const defaultMaxActionsPerTurn = defaults.max_actions_per_turn ?? 1;

	const all = rawManifest.bots.map((rawBot) =>
		loadBotDefinition(repoRoot, rawBot, {
			defaultPromptFiles,
			defaultProvider,
			defaultModel,
			defaultMaxIterations,
			defaultMaxActionsPerTurn,
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
		defaultMaxActionsPerTurn: number;
	},
): LoadedBotDefinition {
	const id = requireNonEmptyString(rawBot.id, "bot.id");
	const displayName = requireNonEmptyString(
		rawBot.display_name,
		`${id}.display_name`,
	);
	const kind = parseKind(rawBot.kind, id);
	const shellAccess = parseShellAccess(rawBot.shell_access, id);
	const provider = parseProvider(
		rawBot.llm?.provider || defaults.defaultProvider,
		`${id}.llm.provider`,
	);
	const model = requireNonEmptyString(
		rawBot.llm?.model || defaults.defaultModel,
		`${id}.llm.model`,
	);
	const allowPersistWork = Boolean(rawBot.allow_persist_work);
	const requirePostPersistVerification =
		rawBot.require_post_persist_verification ?? true;
	const maxIterations = parsePositiveInteger(
		rawBot.max_iterations ?? defaults.defaultMaxIterations,
		`${id}.max_iterations`,
	);
	const maxActionsPerTurn = parsePositiveInteger(
		rawBot.max_actions_per_turn ?? defaults.defaultMaxActionsPerTurn,
		`${id}.max_actions_per_turn`,
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
		shellAccess,
		allowPersistWork,
		requirePostPersistVerification,
		maxIterations,
		maxActionsPerTurn,
		prompt: loadPromptAssembly(repoRoot, promptFiles, {
			shellAccess,
			allowPersistWork,
			requirePostPersistVerification,
			maxActionsPerTurn,
		}),
	};
}

function loadPromptAssembly(
	repoRoot: string,
	promptFiles: string[],
	context: {
		shellAccess: ShellAccess;
		allowPersistWork: boolean;
		requirePostPersistVerification: boolean;
		maxActionsPerTurn: number;
	},
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
		const content = renderPromptTemplate(
			readFileSync(absolutePath, "utf8"),
			repoRoot,
			context,
		);
		promptFileContents[promptFile] = content;
		return content.trimEnd();
	});

	return {
		promptFiles,
		promptFileContents,
		concatenatedPrompt: `${sections.join("\n\n")}\n`,
	};
}

function renderPromptTemplate(
	content: string,
	repoRoot: string,
	context: {
		shellAccess: ShellAccess;
		allowPersistWork: boolean;
		requirePostPersistVerification: boolean;
		maxActionsPerTurn: number;
	},
): string {
	return content
		.replaceAll("{{AGENT_PROTOCOL_VERSION}}", AGENT_PROTOCOL_VERSION)
		.replaceAll(
			"{{AVAILABLE_ACTIONS_BULLETS}}",
			buildAvailableActionsBullets(repoRoot, context),
		)
		.replaceAll(
			"{{IN_PROGRESS_EXAMPLE_ACTIONS}}",
			buildExampleActionsJson(repoRoot, context),
		)
		.replaceAll(
			"{{SHELL_ACTION_RULES}}",
			buildShellActionRules(repoRoot, context),
		)
		.replaceAll(
			"{{POST_PERSIST_COMPLETION_RULES}}",
			buildPostPersistCompletionRules(repoRoot, context),
		)
		.replaceAll("{{MAX_ACTIONS_PER_TURN}}", String(context.maxActionsPerTurn))
		.replaceAll(
			"{{ACTION_COUNT_RULES}}",
			buildActionCountRules(repoRoot, context.maxActionsPerTurn),
		);
}

function parseKind(value: string | undefined, fieldPrefix: string): BotKind {
	if (value === "overseer" || value === "task") {
		return value;
	}
	throw new Error(`${fieldPrefix}.kind must be "overseer" or "task"`);
}

function parseShellAccess(
	value: string | undefined,
	fieldPrefix: string,
): ShellAccess {
	if (value === "read_only" || value === "read_write") {
		return value;
	}
	throw new Error(
		`${fieldPrefix}.shell_access must be "read_only" or "read_write"`,
	);
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

function buildAvailableActionsBullets(
	repoRoot: string,
	context: {
		shellAccess: ShellAccess;
		allowPersistWork: boolean;
		requirePostPersistVerification: boolean;
	},
): string {
	const bullets = [
		loadPromptFile(
			"prompts/partials/available-actions/run-ro-shell.md",
			repoRoot,
		).trim(),
	];

	if (context.shellAccess === "read_write") {
		bullets.push(
			loadPromptFile(
				"prompts/partials/available-actions/replace-in-file-enabled.md",
				repoRoot,
			).trim(),
		);
		bullets.push(
			loadPromptFile(
				"prompts/partials/available-actions/run-shell-enabled.md",
				repoRoot,
			).trim(),
		);
	} else {
		bullets.push(
			loadPromptFile(
				"prompts/partials/available-actions/replace-in-file-disabled.md",
				repoRoot,
			).trim(),
		);
		bullets.push(
			loadPromptFile(
				"prompts/partials/available-actions/run-shell-disabled.md",
				repoRoot,
			).trim(),
		);
	}

	if (context.allowPersistWork) {
		bullets.push(
			loadPromptFile(
				"prompts/partials/available-actions/persist-enabled.md",
				repoRoot,
			).trim(),
		);
	} else {
		bullets.push(
			loadPromptFile(
				"prompts/partials/available-actions/persist-disabled.md",
				repoRoot,
			).trim(),
		);
	}

	return bullets.join("\n");
}

function buildExampleActionsJson(
	repoRoot: string,
	context: {
		shellAccess: ShellAccess;
		allowPersistWork: boolean;
		requirePostPersistVerification: boolean;
		maxActionsPerTurn: number;
	},
): string {
	const examplePath =
		context.shellAccess === "read_write"
			? context.maxActionsPerTurn >= 2
				? "prompts/partials/example-actions/read-write-2.json"
				: "prompts/partials/example-actions/read-write.json"
			: "prompts/partials/example-actions/read-only.json";
	const actions = JSON.parse(loadPromptFile(examplePath, repoRoot)) as Array<{
		type: string;
		command: string;
	}>;

	return JSON.stringify(actions.slice(0, context.maxActionsPerTurn), null, 2);
}

function buildShellActionRules(
	repoRoot: string,
	context: {
		shellAccess: ShellAccess;
		allowPersistWork: boolean;
		requirePostPersistVerification: boolean;
	},
): string {
	if (context.shellAccess === "read_write") {
		return loadPromptFile(
			"prompts/partials/shell-action-rules/read-write.md",
			repoRoot,
		).trim();
	}

	return loadPromptFile(
		"prompts/partials/shell-action-rules/read-only.md",
		repoRoot,
	).trim();
}

function buildPostPersistCompletionRules(
	repoRoot: string,
	context: {
		shellAccess: ShellAccess;
		allowPersistWork: boolean;
		requirePostPersistVerification: boolean;
	},
): string {
	if (!context.allowPersistWork) {
		return "";
	}

	if (context.requirePostPersistVerification) {
		return loadPromptFile(
			"prompts/partials/post-persist-completion-rules/require-verification.md",
			repoRoot,
		).trim();
	}

	return loadPromptFile(
		"prompts/partials/post-persist-completion-rules/handoff-to-overseer.md",
		repoRoot,
	).trim();
}

function buildActionCountRules(
	repoRoot: string,
	maxActionsPerTurn: number,
): string {
	return renderPromptFile(
		"prompts/partials/action-count-rules.md",
		{
			MAX_ACTIONS_PER_TURN: String(maxActionsPerTurn),
			ACTION_WORD: maxActionsPerTurn === 1 ? "action" : "actions",
		},
		repoRoot,
	).trim();
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
