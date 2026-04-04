# Plan: Quality Bot Enhancements

## 1. Update `quality` Bot Permissions
- Modify the dispatcher definitions (e.g., `src/dispatch.ts` or `src/personas.ts`) to allow the `quality` bot to use `run_shell`.
- Instruct the bot to only use `run_shell` for writing files within the `docs/qa/` directory.

## 2. Add `persist_qa` Action
- Implement a new action `persist_qa` in the action handlers, mirroring how `persist_work` is implemented.
- Authorize the `quality` bot to use the `persist_qa` action.

## 3. Update `prompts/quality.md`
- Instruct the `quality` bot to formulate QA reports and write them to `docs/qa/` using `run_shell`.
- Instruct the bot to execute the new `persist_qa` action once its QA report is ready.

## 4. Configure Main Workflow Iterations
- Modify `.github/workflows/overseer.yml` under the `Run Overseer Dispatcher` step to configure 50 iterations (e.g., by adding a `--max-iterations 50` flag or environment variable, depending on the CLI arguments supported by `src/dispatch.ts`).
