# Design: Persist QA Action MVP

## Objective
Design a new `persist_qa` action for the `@quality` bot that allows it to use `run_shell` to write files to `docs/qa/` and then persist them using the new `persist_qa` action.

## Action Semantics
- `run_shell`: Used by the `@quality` bot to write or edit QA documents under `docs/qa/`.
- `persist_qa`: A new JSON action that persists the existing `docs/qa/` changes to the repository. These behaviors are kept as separate steps; `persist_qa` does not accept a file-writing payload and solely delegates to the repository persistence layer.

## Affected Files and Seams

### 1. Protocol / Schema
**File:** `src/utils/agent_protocol.ts`
- Add a new `PersistQaAction` interface with `type: "persist_qa"`.
- Include it in the `AgentAction` union.
- Update `parseAction` to recognize and parse `type: "persist_qa"`.

### 2. Runner Execution
**File:** `src/utils/agent_runner.ts`
- Add `persistQa` as an optional function in `AgentRunnerOptions` (similar to `persistWork`).
- Update `executeActions` to handle `action.type === "persist_qa"`. It should call `options.persistQa()` if available, or return an unavailability error if not.
- Update `updateProgressState` and loop fingerprinting to correctly track the state for `persist_qa` similar to `persist_work`.

### 3. Bot Configuration
**Files:** `bots.json` and `src/bots/bot_config.ts`
- **`bots.json`**: Update the `quality` bot to have `"shell_access": "read_write"` (so it can use `run_shell` to author documents) and a new capability flag `"allow_persist_qa": true`.
- **`src/bots/bot_config.ts`**:
  - Add `allow_persist_qa?: boolean` to `RawBotDefinition`.
  - Add `allowPersistQa: boolean` to `LoadedBotDefinition`.
  - Update `loadBotDefinition` to parse this new flag.
  - Update the prompt assembly logic (`buildAvailableActionsBullets`) to include documentation for the `persist_qa` action when `allowPersistQa` is true.

### 4. Runtime Wiring
**File:** `src/personas/task_persona.ts`
- In `TaskPersona.handleTask`, when preparing `runnerOptions`, map the new `allowPersistQa` capability to the runner. Pass a `persistQa` function (e.g., calling an appropriate persistence method on the injected `persistence` service) to `AgentRunner` if `this.bot.allowPersistQa` is true.

### 5. Quality Bot Prompt
**File:** `prompts/quality.md`
- Update the prompt text to instruct the `@quality` bot to use `run_shell` to author/modify files in the `docs/qa/` directory.
- Instruct the bot to follow up with the `persist_qa` action to persist those changes once the authoring is complete.

## Implementation Steps
1. Update `src/utils/agent_protocol.ts` with the new action schema.
2. Update `src/utils/agent_runner.ts` to execute `persist_qa`.
3. Update `src/bots/bot_config.ts` to parse the new capability flag and inject its prompt fragment.
4. Update `bots.json` to grant `shell_access: "read_write"` and `allow_persist_qa: true` to the `@quality` bot.
5. Update `src/personas/task_persona.ts` to pass the `persistQa` execution function to `AgentRunnerOptions`.
6. Update `prompts/quality.md` with instructions on using `run_shell` for QA files followed by `persist_qa`.
