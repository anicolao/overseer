import { exec } from "node:child_process";
import { promisify } from "node:util";
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

	/**
	 * Parses a string for [RUN:command]...[/RUN] blocks and executes them.
	 */
	async executeAllBlocks(content: string): Promise<string> {
		const runRegex = /\[RUN:([\s\S]+?)\]/g;
		let fullOutput = "";
		const matches = Array.from(content.matchAll(runRegex));
		logTrace("shell.blocks.scan", {
			content: textStats(content),
			runMarkerCount: (content.match(/\[RUN:/g) || []).length,
			parsedBlockCount: matches.length,
			parsedCommands: matches.map((match) => match[1].trim()),
		});

		for (const match of matches) {
			const command = match[1].trim();
			const result = await this.executeCommand(command);

			fullOutput += `\n--- EXECUTING: ${command} ---\n`;
			if (result.stdout) fullOutput += `STDOUT:\n${result.stdout}\n`;
			if (result.stderr) fullOutput += `STDERR:\n${result.stderr}\n`;
			fullOutput += `EXIT CODE: ${result.exitCode}\n`;
		}

		return fullOutput;
	}
}
