import { ExecutionSandbox } from '../../src/core/sandbox';

describe('ExecutionSandbox Functional Tests', () => {
  let sandbox: ExecutionSandbox;

  beforeEach(() => {
    sandbox = new ExecutionSandbox();
  });

  test('should successfully execute valid code injected with context', async () => {
    const code = 'return base + modifier;';
    const context = { base: 100, modifier: 42 };
    const result = await sandbox.execute(code, context);
    expect(result).toBe(142);
  });

  test('should gracefully capture and throw errors on invalid code execution', async () => {
    const code = 'throw new Error("Intentional violation");';
    await expect(sandbox.execute(code, {})).rejects.toThrow('Sandbox execution failed: Intentional violation');
  });
});