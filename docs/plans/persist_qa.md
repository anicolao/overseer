# Implementation Plan: Persist QA Action MVP

This plan breaks down the approved design (`docs/design/persist_qa.md`) into small, actionable increments for the developer-tester.

## Increment 1: Protocol and Runner Execution
**Goal:** Define the new action type and enable the runner to execute it.
**Files:**
- `src/utils/agent_protocol.ts`
- `src/utils/agent_runner.ts`
**Steps:**
1. In `src/utils/agent_protocol.ts`, add the `PersistQaAction` interface (`{ type: "persist_qa" }`), add it to the `AgentAction` union, and update `parseAction` to handle it.
2. In `src/utils/agent_runner.ts`, add `persistQa?: () => Promise<string>` to `AgentRunnerOptions`.
3. In `src/utils/agent_runner.ts`, update `executeActions` to handle `action.type === "persist_qa"`. Call `options.persistQa()` if available, otherwise return an error string. Update `updateProgressState` or relevant loop state to track `persist_qa` like `persist_work`.

## Increment 2: Bot Configuration and Runtime Wiring
**Goal:** Allow the quality bot to be configured with the new action and wire it to the execution context.
**Files:**
- `src/bots/bot_config.ts`
- `bots.json`
- `src/personas/task_persona.ts`
**Steps:**
1. In `src/bots/bot_config.ts`, add `allow_persist_qa?: boolean` to `RawBotDefinition` and `allowPersistQa: boolean` to `LoadedBotDefinition`. Parse it in `loadBotDefinition`.
2. In `src/bots/bot_config.ts`, update `buildAvailableActionsBullets` (or prompt assembly) to include the `persist_qa` prompt documentation when `allowPersistQa` is true. Create `prompts/partials/available-actions/persist-qa-enabled.md` to document the action format.
3. In `bots.json`, update the `"quality"` bot to have `"shell_access": "read_write"` and `"allow_persist_qa": true`.
4. In `src/personas/task_persona.ts`, update `TaskPersona.handleTask` to map the `this.bot.allowPersistQa` capability into the `runnerOptions`. Provide a `persistQa` function (e.g. calling `this.options.services.persistence.persistQa()` if you add it, or mapping to an existing persist method).

## Increment 3: Update Quality Bot Prompts and Persistence Service
**Goal:** Give the quality bot explicit instructions on how to use `run_shell` and `persist_qa`. Update persistence layer if needed.
**Files:**
- `prompts/quality.md`
- `src/utils/persistence.ts`
**Steps:**
1. Update `prompts/quality.md` to instruct the bot to use `run_shell` to author/modify files in `docs/qa/`, and then follow up with the `persist_qa` action.
2. If `src/utils/persistence.ts` needs a new method `persistQa()`, implement it (e.g. delegating to the same git operations as `persistWork()`).
