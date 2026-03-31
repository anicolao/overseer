import { SecureSandbox } from '../../src/sandbox/secure-sandbox';

describe('Secure Sandbox Spike', () => {
    let sandbox: SecureSandbox;

    beforeEach(() => {
        sandbox = new SecureSandbox();
    });

    it('should execute basic math operations safely', async () => {
        const result = await sandbox.execute('1 + 1');
        expect(result).toBe(2);
    });

    it('should correctly utilize injected context variables', async () => {
        const result = await sandbox.execute('a + b', { a: 5, b: 10 });
        expect(result).toBe(15);
    });

    it('should throw an error on invalid or malicious code', async () => {
        await expect(sandbox.execute('throw new Error("Sandbox error")')).rejects.toThrow('Sandbox error');
    });
    
    it('should block access to host process environment', async () => {
        await expect(sandbox.execute('process.env')).rejects.toThrow('process is not defined');
    });
});