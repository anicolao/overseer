# Technical Design: `persist_qa` Action

## Objective
Introduce a `persist_qa` action that saves quality assurance output directly to `docs/qa/...` and grant the `@quality` bot access to this action as well as `run_shell` to allow running test commands.

## Motivation
Currently, quality assurance outputs might not be structured or persisted effectively by the `@quality` bot. By giving it dedicated permissions to persist QA results via a specific action and execute tests via `run_shell`, we can ensure consistent documentation and feedback loops.

## Requirements
1.  **New Action `persist_qa`**:
    *   Added to `ActionType` in `src/utils/agent_protocol.ts`.
    *   Takes arguments `content` (string) and `path` (string, defaults to `docs/qa/latest.md` or similar).
    *   Implemented in `src/utils/agent_runner.ts` under the action handler.
2.  **Bot Capability**:
    *   The `@quality` bot needs authorization to use both `persist_qa` and `run_shell`. This requires changes in `src/bots/bot_config.ts`.
3.  **Persona Updates**:
    *   `src/personas/task_persona.ts` (or the quality bot's specific persona file) needs to describe the `persist_qa` action and when to use it.

## Implementation Details

### 1. `src/utils/agent_protocol.ts`
Add `persist_qa` to the `ActionType` enum/type.

### 2. `src/utils/agent_runner.ts`
Implement the `persist_qa` handler. It should:
*   Ensure the directory exists.
*   Write the `content` to the `path`.

### 3. `src/bots/bot_config.ts`
Update the `BotConfig` for the `@quality` bot to include both `persist_qa` and `run_shell` in its `allowed_actions`.

### 4. `src/personas/task_persona.ts`
Add the JSON schema and rules for using `persist_qa`.
