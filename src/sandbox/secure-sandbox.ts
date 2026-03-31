import * as vm from 'vm';

export class SecureSandbox {
    /**
     * Executes arbitrary code in an isolated V8 context.
     * @param code The JavaScript code to execute.
     * @param context Additional variables to expose to the sandbox.
     * @returns The evaluated result of the script.
     */
    async execute(code: string, context: Record<string, any> = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                const sandboxContext = vm.createContext({ ...context });
                const script = new vm.Script(code);
                // Hard timeout implemented to prevent infinite loops during spikes
                const result = script.runInContext(sandboxContext, { timeout: 1000 });
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    }
}