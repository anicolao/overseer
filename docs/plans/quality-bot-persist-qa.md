# Plan: Quality Bot Enhancements

## 1. Update `quality` Bot Permissions
- Modify the dispatcher definitions (e.g., `src/dispatch.ts` or `src/personas.ts`) to allow the `quality` bot to use `run_shell`.
- Instruct the bot to only use `run_shell` for writing files within the `docs/qa/` directory.

## 2. Add `persist_qa` Action (Decomposed)

### 2.1 Update Protocol (`src/agent_protocol.ts`)
- Add `persist_qa` to the `ActionType` union and schema.
- Make sure `persist_qa` has proper documentation in the Zod schema.

### 2.2 Update Runner Implementation (`src/agent_runner.ts`)
- Implement the execution logic for the `persist_qa` action in `src/agent_runner.ts`, mirroring how `persist_work` is implemented (running `git add` for `docs/qa/`, committing, and pushing).

### 2.3 Update Runner Tests (`src/agent_runner.test.ts`)
- Update the test suite in `src/agent_runner.test.ts` to cover the execution logic for the new `persist_qa` action.

### 2.4 Authorize Bot for `persist_qa`
- Update permissions to authorize the `quality` bot to use `persist_qa` (e.g., in `src/prompts.ts`, `prompts/` files, or dispatcher configuration).

## 3. Update `prompts/quality.md`
- Instruct the `quality` bot to formulate QA reports and write them to `docs/qa/` using `run_shell`.
- Instruct the bot to execute the new `persist_qa` action once its QA report is ready.

## 4. Configure Main Workflow Iterations
- Modify `.github/workflows/overseer.yml` under the `Run Overseer Dispatcher` step to configure 50 iterations (e.g., by adding a `--max-iterations 50` flag or environment variable, depending on the CLI arguments supported by `src/dispatch.ts`).
