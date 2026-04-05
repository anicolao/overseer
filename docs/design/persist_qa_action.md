# Design: persist_qa MVP

## Objective
Enable the `@quality` bot to write QA documentation under `docs/qa/` using `run_shell` and persist these changes using a new `persist_qa` action.

## Action Semantics
- `run_shell`: Used by the quality bot to write or edit QA documents under `docs/qa/`.
- `persist_qa`: A new action with no payload (`{"type": "persist_qa"}`) that saves the changes made to the `docs/qa/` directory.

## Affected Files and Implementation Steps

### 1. Action Protocol Schema (`src/utils/agent_protocol.ts`)
- Define a new `PersistQaAction` interface: `{ type: "persist_qa" }`.
- Add `PersistQaAction` to the `AnyAction` union type.
- Update the action parsing logic to recognize and validate the `persist_qa` type.

### 2. Runtime Execution (`src/utils/agent_runner.ts`)
- Update the action execution loop to handle the `persist_qa` action type.
- The execution should trigger the persistence layer to commit changes under `docs/qa/`.

### 3. Bot Manifest (`bots.json`)
- Update the `quality` bot entry:
  - Change `"shell_access": "read_only"` to `"shell_access": "read_write"` to enable `run_shell` capabilities.
  - Add a new capability flag: `"allow_persist_qa": true`.
  - Update `prompt_files` to replace `prompts/shared/read-only-agent.md` with a write-capable prompt if applicable.

### 4. Runtime Bot Config (`src/bots/bot_config.ts`)
- Add the `allow_persist_qa?: boolean` optional field to the raw bot configuration interface.
- Parse and export `allowPersistQa: boolean` parsed from `rawBot.allow_persist_qa`.

### 5. Capability Wiring (`src/personas/task_persona.ts`)
- Wire the new `allowPersistQa` config from `botConfig` into the runtime environment injected into `AgentRunner`.
- Ensure the prompt context generation makes `persist_qa` available only if `allowPersistQa` is true.

### 6. Prompt Instructions (`prompts/quality.md`)
- Update the `@quality` persona instructions to explain the use of `run_shell` (for creating or modifying QA docs in `docs/qa/`) and `persist_qa` (for persisting those changes).
- Emphasize that `persist_qa` does not take a payload and relies on `run_shell` to perform the file edits.
