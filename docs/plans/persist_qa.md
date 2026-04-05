# Implementation Plan: persist_qa Capability

## Increment 1: Action Protocol Schema
- **File:** `src/utils/agent_protocol.ts`
- **Changes:**
  - Export a new `PersistQaAction` interface with `type: "persist_qa"`.
  - Add `PersistQaAction` to the `AgentAction` union type.
  - In `parseAction()`, add an `if (type === "persist_qa")` block that returns `{ type: "persist_qa" }`.
  - Update the error message at the end of `parseAction()` to include `"persist_qa"`.

## Increment 2: Runtime Execution and Wiring
- **File:** `src/utils/agent_runner.ts`
- **Changes:**
  - Add `persistQa?: () => Promise<PersistWorkResult>` to `AgentRunnerOptions`.
  - In `executeActions()`, add a block to handle `action.type === "persist_qa"`. If `!options.persistQa`, deny execution similarly to how `persist_work` is denied. If `options.persistQa` is provided, `await options.persistQa()` and push the result into `executedActions`.
  - In `updateProgressState()`, update the check `if (action.type === "persist_work")` to `if (action.type === "persist_work" || action.type === "persist_qa")` so that state tracking (like `state.persistSucceededAfterWrite`) works correctly for the new action.
- **File:** `src/personas/task_persona.ts`
- **Changes:**
  - In the `handleTask` method, when building `runnerOptions`, map `persistQa` to a callback that calls `this.persistence.persistWork(issueNumber, this.bot.id)` if `this.bot.allowPersistQa` is true (otherwise map it to `undefined`).

## Increment 3: Bot Configuration and Prompts
- **File:** `src/bots/bot_config.ts`
- **Changes:**
  - Add `allow_persist_qa?: boolean` to the `RawBotDefinition` interface.
  - Add `allowPersistQa: boolean` to the `LoadedBotDefinition` interface.
  - In `loadBotDefinition()`, parse `allowPersistQa: Boolean(rawBot.allow_persist_qa)` and include it in the returned object.
- **File:** `bots.json`
- **Changes:**
  - For the `quality` bot, change `"shell_access"` to `"read_write"`.
  - For the `quality` bot, add `"allow_persist_qa": true`.
- **File:** `prompts/quality.md`
- **Changes:**
  - Add explicit instructions telling the `@quality` bot that when it needs to save QA documentation, it must use a two-step workflow: first use `run_shell` to write the files locally under `docs/qa/`, and then call the `{"type": "persist_qa"}` action (with no arguments) to commit and persist those changes.