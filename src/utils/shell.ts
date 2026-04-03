import { exec } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { AgentAction } from "./agent_protocol.js";
import { logTrace, serializeError, textStats } from "./trace.js";

const execAsync = promisify(exec);
export type ShellExecutionMode = "read_only" | "read_write";

export interface ShellResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	error?: Error;
}

export class ShellService {
	private currentDirectory: string;

	constructor(
		private repoRoot: string = process.cwd(),
		private commandWrapper: (command: string) => string = wrapInNixDevelop,
	) {
		this.currentDirectory = repoRoot;
	}

	async executeCommand(
		command: string,
		executionMode: ShellExecutionMode = "read_write",
	): Promise<ShellResult> {
		if (executionMode === "read_only") {
			return this.executeReadOnlyCommand(command);
		}

		return this.executeLiveCommand(command);
	}

	private async executeLiveCommand(command: string): Promise<ShellResult> {
		// Append pwd to the command to track directory changes.
		const trackingCommand = `cd ${shellSingleQuote(this.currentDirectory)} && ( ${command} ) && pwd`;
		const wrappedCommand = this.commandWrapper(trackingCommand);
		console.log(`Executing shell command: ${command}`);
		const startedAt = Date.now();
		logTrace("shell.command.begin", {
			command,
			wrappedCommand,
			runsInsideNixDevelop: wrappedCommand !== command,
		});
		try {
			const { stdout, stderr } = await execAsync(wrappedCommand, {
				cwd: this.repoRoot,
			});

			const lines = stdout.trim().split("\n");
			const newDirectory = lines.pop()?.trim();
			const actualStdout = lines.join("\n").trim();

			if (newDirectory && existsSync(newDirectory)) {
				this.currentDirectory = newDirectory;
			}

			logTrace("shell.command.success", {
				command,
				wrappedCommand,
				executionMode: "read_write",
				durationMs: Date.now() - startedAt,
				stdout: textStats(actualStdout),
				stderr: textStats(stderr.trim()),
				currentDirectory: this.currentDirectory,
			});
			return {
				stdout: actualStdout,
				stderr: stderr.trim(),
				exitCode: 0,
			};
		} catch (error: unknown) {
			const err = error as { stdout?: string; stderr?: string; code?: number };
			console.error(`Command execution failed: ${command}`, error);
			logTrace("shell.command.error", {
				command,
				wrappedCommand,
				executionMode: "read_write",
				durationMs: Date.now() - startedAt,
				exitCode: err.code || 1,
				stdout: textStats(err.stdout?.trim() || ""),
				stderr: textStats(err.stderr?.trim() || ""),
				error: serializeError(error),
			});
			return {
				stdout: err.stdout?.trim() || "",
				stderr: err.stderr?.trim() || "",
				exitCode: err.code || 1,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private async executeReadOnlyCommand(command: string): Promise<ShellResult> {
		const sandbox = createReadOnlySandbox(this.repoRoot);
		// Note: sandbox.repoDir is always the starting point for read-only commands.
		// We could track CWD within sandbox too if we wanted multi-command read-only actions
		// to behave like a single session, but usually each turn starts fresh.
		// For now, let's just make it consistent with the cd/pwd wrapper.
		const trackingCommand = `cd ${shellSingleQuote(sandbox.repoDir)} && ( ${command} ) && pwd`;
		const wrappedCommand = this.commandWrapper(trackingCommand);
		console.log(`Executing read-only shell command: ${command}`);
		const startedAt = Date.now();
		logTrace("shell.command.begin", {
			command,
			wrappedCommand,
			executionMode: "read_only",
			runsInsideNixDevelop: wrappedCommand !== command,
			repoRoot: sandbox.repoDir,
		});
		try {
			const { stdout, stderr } = await execAsync(wrappedCommand, {
				cwd: sandbox.repoDir,
				env: {
					...process.env,
					HOME: sandbox.homeDir,
					TMPDIR: sandbox.tmpDir,
					TMP: sandbox.tmpDir,
					TEMP: sandbox.tmpDir,
					GIT_OPTIONAL_LOCKS: "0",
				},
			});

			const lines = stdout.trim().split("\n");
			const _newDirectory = lines.pop()?.trim();
			const actualStdout = lines.join("\n").trim();

			logTrace("shell.command.success", {
				command,
				wrappedCommand,
				executionMode: "read_only",
				durationMs: Date.now() - startedAt,
				stdout: textStats(actualStdout),
				stderr: textStats(stderr.trim()),
			});
			return {
				stdout: actualStdout,
				stderr: stderr.trim(),
				exitCode: 0,
			};
		} catch (error: unknown) {
			const err = error as { stdout?: string; stderr?: string; code?: number };
			console.error(`Read-only command execution failed: ${command}`, error);
			logTrace("shell.command.error", {
				command,
				wrappedCommand,
				executionMode: "read_only",
				durationMs: Date.now() - startedAt,
				exitCode: err.code || 1,
				stdout: textStats(err.stdout?.trim() || ""),
				stderr: textStats(err.stderr?.trim() || ""),
				error: serializeError(error),
			});
			return {
				stdout: err.stdout?.trim() || "",
				stderr: err.stderr?.trim() || "",
				exitCode: err.code || 1,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		} finally {
			try {
				rmSync(sandbox.rootDir, {
					recursive: true,
					force: true,
					maxRetries: 5,
					retryDelay: 50,
				});
			} catch (cleanupError) {
				logTrace("shell.readOnlySandbox.cleanupError", {
					repoRoot: sandbox.rootDir,
					error: serializeError(cleanupError),
				});
			}
		}
	}

	async executeActions(actions: AgentAction[]): Promise<string> {
		let fullOutput = "";
		logTrace("shell.actions.scan", {
			actionCount: actions.length,
			actions: actions.map((action) => ({
				type: action.type,
				command:
					action.type === "run_shell" || action.type === "run_ro_shell"
						? textStats(action.command)
						: textStats("persist_work"),
			})),
		});

		for (const action of actions) {
			if (action.type !== "run_shell" && action.type !== "run_ro_shell") {
				continue;
			}

			const result = await this.executeCommand(
				action.command,
				action.type === "run_ro_shell" ? "read_only" : "read_write",
			);

			fullOutput += `\n--- EXECUTING: ${action.command} ---\n`;
			if (result.stdout) fullOutput += `STDOUT:\n${result.stdout}\n`;
			if (result.stderr) fullOutput += `STDERR:\n${result.stderr}\n`;
			fullOutput += `EXIT CODE: ${result.exitCode}\n`;
		}

		return fullOutput;
	}
}

export function wrapInNixDevelop(command: string): string {
	const trimmedCommand = command.trim();
	if (/^nix\s+develop\b/.test(trimmedCommand)) {
		return command;
	}

	return `nix develop -c bash -lc ${shellSingleQuote(command)}`;
}

function shellSingleQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function createReadOnlySandbox(sourceRepoRoot: string): {
	rootDir: string;
	repoDir: string;
	homeDir: string;
	tmpDir: string;
} {
	const rootDir = join(
		tmpdir(),
		`overseer-ro-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	);
	const repoDir = join(rootDir, "repo");
	const homeDir = join(rootDir, "home");
	const tempDir = join(rootDir, "tmp");
	mkdirSync(rootDir, { recursive: true });
	mkdirSync(homeDir, { recursive: true });
	mkdirSync(tempDir, { recursive: true });

	cpSync(sourceRepoRoot, repoDir, { recursive: true });
	makeDirectoryTreeReadOnly(repoDir);

	return {
		rootDir,
		repoDir,
		homeDir,
		tmpDir: tempDir,
	};
}

function makeDirectoryTreeReadOnly(path: string): void {
	const stat = lstatSync(path);
	if (stat.isSymbolicLink()) {
		return;
	}

	if (stat.isDirectory()) {
		if (basename(path) !== ".git") {
			chmodSync(path, stat.mode & ~0o222);
			for (const entry of readdirSync(path)) {
				makeDirectoryTreeReadOnly(join(path, entry));
			}
		}
		return;
	}

	chmodSync(path, stat.mode & ~0o222);
}
