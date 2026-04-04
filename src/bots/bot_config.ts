import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_PROTOCOL_VERSION } from "../utils/agent_protocol.js";
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
	allowPersistQa: boolean;
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
	const allowPersistQa = Boolean(rawBot.allow_persist_qa);
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
		allowPersistQa,
		maxIterations,
		maxActionsPerTurn,
		prompt: loadPromptAssembly(repoRoot, promptFiles, {
			shellAccess,
			allowPersistWork,
			allowPersistQa,
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
		allowPersistQa: boolean;
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
	context: {
		shellAccess: ShellAccess;
		allowPersistWork: boolean;
		allowPersistQa: boolean;
		maxActionsPerTurn: number;
	},
): string {
	return content
		.replaceAll("{{AGENT_PROTOCOL_VERSION}}", AGENT_PROTOCOL_VERSION)
		.replaceAll(
			"{{AVAILABLE_ACTIONS_BULLETS}}",
			buildAvailableActionsBullets(context),
		)
		.replaceAll(
			"{{IN_PROGRESS_EXAMPLE_ACTIONS}}",
			buildExampleActionsJson(context),
		)
		.replaceAll("{{SHELL_ACTION_RULES}}", buildShellActionRules(context))
		.replaceAll("{{MAX_ACTIONS_PER_TURN}}", String(context.maxActionsPerTurn))
		.replaceAll(
			"{{ACTION_COUNT_RULES}}",
			buildActionCountRules(context.maxActionsPerTurn),
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

function buildAvailableActionsBullets(context: {
	shellAccess: ShellAccess;
	allowPersistWork: boolean;
	allowPersistQa: boolean;
}): string {
	const bullets = [
		'- `{"type":"run_ro_shell","command":"..."}` for repository inspection and verification commands inside a disposable read-only clone of the repository. This command runs inside the repository\'s default `nix develop -c` environment automatically.',
	];

	if (context.shellAccess === "read_write") {
		bullets.push(
			'- `{"type":"run_shell","command":"..."}` for repository edits and verification commands in the live repository checkout. This command also runs inside the repository\'s default `nix develop -c` environment automatically.',
		);
	} else {
		bullets.push(
			"- `run_shell` is not available to this bot. Stay inside `run_ro_shell` and do not attempt repository writes.",
		);
	}

	if (context.allowPersistWork) {
		bullets.push(
			'- `{"type":"persist_work"}` for dispatcher-owned persistence when your bot is authorized to publish repository changes.',
		);
	} else {
		bullets.push(
			"- `persist_work` is not available to this bot unless the dispatcher explicitly enables it.",
		);
	}

	if (context.allowPersistQa) {
		bullets.push(
			'- `{"type":"persist_qa"}` for dispatcher-owned persistence when your bot is authorized to publish a QA report to the issue branch.',
		);
	} else {
		bullets.push("- `persist_qa` is not available to this bot.");
	}

	return bullets.join("\n");
}

function buildExampleActionsJson(context: {
	shellAccess: ShellAccess;
	allowPersistWork: boolean;
	allowPersistQa: boolean;
	maxActionsPerTurn: number;
}): string {
	const actions =
		context.shellAccess === "read_write"
			? [
					{
						type: "run_ro_shell",
						command: "[ -f WORKFLOW.md ] && cat WORKFLOW.md || true",
					},
					{
						type: "run_shell",
						command: "cat docs/plans/current-plan.md",
					},
				]
			: [
					{
						type: "run_ro_shell",
						command: "[ -f WORKFLOW.md ] && cat WORKFLOW.md || true",
					},
					{
						type: "run_ro_shell",
						command: "cat docs/plans/current-plan.md",
					},
				];

	return JSON.stringify(actions.slice(0, context.maxActionsPerTurn), null, 2);
}

function buildShellActionRules(context: {
	shellAccess: ShellAccess;
	allowPersistWork: boolean;
	allowPersistQa: boolean;
}): string {
	if (context.shellAccess === "read_write") {
		return [
			"- `run_ro_shell` is the default choice for inspection and verification.",
			"- Use `run_shell` only when you intentionally need to modify repository files or run write-dependent project tooling.",
			"- If the environment is missing a tool you need, edit `flake.nix` and then continue using the shell actions above.",
		].join("\n");
	}

	return [
		"- Use `run_ro_shell` for inspection and verification only.",
		"- `run_shell` is unavailable to this bot.",
		"- If the environment is missing a tool you need, note that in your output instead of trying to modify the repository or tooling configuration yourself.",
	].join("\n");
}

function buildActionCountRules(maxActionsPerTurn: number): string {
	const actionWord = maxActionsPerTurn === 1 ? "action" : "actions";
	return [
		`- You may return at most ${maxActionsPerTurn} ${actionWord} in a single response.`,
		"- Prefer exactly one action per turn unless bundling is clearly necessary to complete one immediate step.",
		"- Do not repeat the same action on consecutive turns unless the repository state changed or your previous output explains why the retry is materially different.",
	].join("\n");
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
