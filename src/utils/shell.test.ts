import { ShellService } from './shell.js';
import { describe, it, expect } from 'vitest';

describe('ShellService', () => {
    const shell = new ShellService();

    it('executes a basic command', async () => {
        const result = await shell.executeCommand('echo "hello world"');
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('hello world');
    });

    it('executes blocks properly', async () => {
        const output = await shell.executeAllBlocks('Some text [RUN:echo "block test"] more text');
        expect(output).toContain('block test');
        expect(output).toContain('EXIT CODE: 0');
    });
});