# Implementation Plan: persist_qa

This plan breaks down the approved design (`docs/design/persist_qa.md`) into executable increments.

## Increment 1: Update Agent Protocol
- **Files**: `src/utils/agent_protocol.ts`
- **Actions**:
  - Define a new `PersistQaAction` interface with `type: "persist_qa"`.
  - Add `PersistQaAction` to the `Action` type union.
  - Update `parseAction` to recognize and parse `{"type": "persist_qa"}`.

## Increment 2: Update Bot Configuration
- **Files**: `bots.json`, `src/bots/bot_config.ts`
- **Actions**:
  - In `src/bots/bot_config.ts`, add `canPersistQA?: boolean` to the capability interface.
  - In `bots.json`, add `"canPersistQA": true` to the `@quality` bot's capabilities.

## Increment 3: Wire Persona Capabilities
- **Files**: `src/personas/task_persona.ts`
- **Actions**:
  - Update the initialization logic (e.g., `buildTaskRunner`) to read `canPersistQA` from the bot configuration and pass it into the `AgentRunner` configuration.

## Increment 4: Implement Action Execution
- **Files**: `src/utils/agent_runner.ts` (and potentially `src/utils/persistence.ts`)
- **Actions**:
  - In `src/utils/agent_runner.ts`, add a handler for the `persist_qa` action.
  - Enforce the `canPersistQA` capability before allowing execution.
  - Invoke persistence logic restricted to the `docs/qa/` directory (e.g., using a new or existing helper in `src/utils/persistence.ts`).
  - Return the appropriate success or failure response to the agent.

## Increment 5: Update Quality Persona Prompt
- **Files**: `prompts/quality.md`
- **Actions**:
  - Document the parameterless `persist_qa` action.
  - Clarify the action semantics: `run_shell` writes or edits files under `docs/qa/`, and `persist_qa` persists those existing changes.
