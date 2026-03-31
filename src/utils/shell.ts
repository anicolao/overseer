import { exec } from 'child_process';
import { promisify } from 'util';

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
        try {
            const { stdout, stderr } = await execAsync(command);
            return {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0
            };
        } catch (error: any) {
            console.error(`Command execution failed: ${command}`, error);
            return {
                stdout: error.stdout?.trim() || '',
                stderr: error.stderr?.trim() || '',
                exitCode: error.code || 1,
                error: error
            };
        }
    }

    /**
     * Parses a string for [RUN:command]...[/RUN] blocks and executes them.
     */
    async executeAllBlocks(content: string): Promise<string> {
        const runRegex = /\[RUN:([\s\S]+?)\]/g;
        let match;
        let fullOutput = "";

        while ((match = runRegex.exec(content)) !== null) {
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
