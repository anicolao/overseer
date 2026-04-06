# Implementation Plan: persist_qa for Quality Bot

This plan decomposes the approved `persist_qa` design into actionable increments.

## Increment 1: Protocol and Bot Config Updates
1. Modify `src/utils/agent_protocol.ts` to add the `PersistQaAction` interface (`type: "persist_qa"`) and add it to the `AgentAction` union. Update `parseAction` to handle it correctly (similar to `persist_work`).
2. Update `bots.json` to change the `quality` bot's `"shell_access"` to `"read_write"` and add a new `"allow_persist_qa": true` property.
3. Modify `src/bots/bot_config.ts`:
   - Add `allowPersistQa: boolean` to the `LoadedBotDefinition` and internal bot types.
   - Update `loadBotDefinition` to parse `allow_persist_qa` from the JSON (defaulting to false).
   - Update `loadPromptAssembly` and `renderPromptTemplate` to include `allowPersistQa` in their contexts.
   - Update `buildAvailableActionsBullets` and `buildExampleActionsJson` to inject `persist_qa` instructions when `allowPersistQa` is true. Create a new prompt file like `prompts/partials/available-actions/persist-qa-enabled.md` if needed for the bullets.

## Increment 2: Runner Execution and Tracking
1. Modify `src/utils/agent_runner.ts` to support executing the new action:
   - Add `persistQa?: () => Promise<PersistWorkResult>` to `AgentRunnerOptions`.
   - In `executeActions`, add a branch for `action.type === "persist_qa"`. If `options.persistQa` is missing, return a denial. Otherwise, call `await options.persistQa()` and push the result to `executedActions`.
   - Update tracking functions (`updateProgressState`, `validateDoneResponse`, `buildProgressReminder`) so that a successful `persist_qa` satisfies the persistence requirement for write actions, just like `persist_work`.

## Increment 3: Wiring in Personas and CLI
1. Update `src/personas/task_persona.ts`:
   - In the `runAutonomousLoop` path, if `this.bot.allowPersistQa` is true, pass a `persistQa` callback in `runnerOptions` that delegates to `this.persistence.persistWork(issueNumber, this.bot.id)`.
   - In the `runCliLoop` path, add logic to auto-persist QA work via `this.persistence.persistWork` after the CLI finishes, mirroring the existing behavior for `allowPersistWork`.
2. Update `prompts/quality.md` with explicit instructions for the bot to generate QA reports in `docs/qa/` via `run_shell` and use the `persist_qa` action to save its work.
