import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { AgentAction } from "./agent_protocol.js";
import { logTrace, serializeError, textStats } from "./trace.js";

const execAsync = promisify(exec);

export interface ShellResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	error?: Error;
}

export class ShellService {
	async executeCommand(command: string): Promise<ShellResult> {
		console.log(`Executing shell command: ${command}`);
		const startedAt = Date.now();
		logTrace("shell.command.begin", {
			command,
		});
		try {
			const { stdout, stderr } = await execAsync(command);
			logTrace("shell.command.success", {
				command,
				durationMs: Date.now() - startedAt,
				stdout: textStats(stdout.trim()),
				stderr: textStats(stderr.trim()),
			});
			return {
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				exitCode: 0,
			};
		} catch (error: unknown) {
			const err = error as { stdout?: string; stderr?: string; code?: number };
			console.error(`Command execution failed: ${command}`, error);
			logTrace("shell.command.error", {
				command,
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

	async executeActions(actions: AgentAction[]): Promise<string> {
		let fullOutput = "";
		logTrace("shell.actions.scan", {
			actionCount: actions.length,
			actions: actions.map((action) => ({
				type: action.type,
				command:
					action.type === "run_shell"
						? textStats(action.command)
						: textStats("persist_work"),
			})),
		});

		for (const action of actions) {
			if (action.type !== "run_shell") {
				continue;
			}

			const result = await this.executeCommand(action.command);

			fullOutput += `\n--- EXECUTING: ${action.command} ---\n`;
			if (result.stdout) fullOutput += `STDOUT:\n${result.stdout}\n`;
			if (result.stderr) fullOutput += `STDERR:\n${result.stderr}\n`;
			fullOutput += `EXIT CODE: ${result.exitCode}\n`;
		}

		return fullOutput;
	}
}
