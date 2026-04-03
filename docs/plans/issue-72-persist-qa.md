# Implementation Plan: Persist QA Action (Issue #72)

## Goal
Support a new `persist_qa` action to allow the QA bot to independently run shell commands and persist QA reports to the `docs/qa/` directory, without granting it the ability to push general code changes using `persist_work`.

## Files to Modify

### 1. `src/utils/agent_protocol.ts`
- **Interfaces**: Define `PersistQaAction` (`{ type: "persist_qa" }`).
- **Union Types**: Add `PersistQaAction` to the `AgentAction` union.
- **Parsing**: Update `parseAction` to validate and return `persist_qa` actions.

### 2. `src/utils/agent_runner.ts` (Options & Execution)
- **Options**: Add `persistQa?: () => Promise<PersistWorkResult>` to `AgentRunnerOptions`.
- **Execution**: In `executeActions`, handle `action.type === "persist_qa"`. Reject it if `options.persistQa` is missing, similar to `persist_work` logic.

### 3. `src/utils/agent_runner.ts` (State Tracking)
- **State Tracking**: Update `updateProgressState` and `validateDoneResponse` to recognize `persist_qa` as a valid persistence mechanism, allowing the task to transition to `done` if a QA report was persisted.

### 4. `src/bots/bot_config.ts`
- **Definitions**: Add `allow_persist_qa?: boolean` to `RawBotDefinition` and `allowPersistQa: boolean` to `LoadedBotDefinition`.
- **Parsing**: Parse `allow_persist_qa` in `loadBotDefinition`.
- **Prompts**: Update prompt building functions (`buildAvailableActionsBullets`, `buildExampleActionsJson`, `buildShellActionRules`) to conditionally include instructions for `persist_qa` based on `allowPersistQa`. Ensure it mentions that this action commits work specific to QA tasks.

### 5. `prompts/quality.md`
- Add instructions specific to the QA role:
  - You have `run_shell` access strictly for creating or updating QA reports in the `docs/qa/` directory.
  - Do not modify application source code.
  - Use the `persist_qa` action to save your reports.

### 6. `bots.json` (Configuration Update)
- Modify the QA bot's definition:
  - Change `"shell_access"` to `"read_write"`.
  - Add `"allow_persist_qa": true`.
