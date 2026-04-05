# Implementation Plan: persist_qa Action

Based on the approved design in `docs/design/persist-qa.md`.

## Increment 1: Action Protocol and Runner
**Files:** `src/utils/agent_protocol.ts`, `src/utils/agent_runner.ts`
- **`agent_protocol.ts`:** Add `{"type": "persist_qa"}` to the allowed action types schema.
- **`agent_runner.ts`:** Implement the dispatch handler for `persist_qa` within the runner loop, triggering the required persistence logic (similar to `persist_work`).

## Increment 2: Permissions and Persona
**Files:** `src/bots/bot_config.ts`, `src/personas/task_persona.ts`
- **`bot_config.ts`:** Grant the `@quality` bot permission to use `persist_qa` and ensure the action mapping assigns appropriate read/write capabilities (e.g., mapping to `requiresWrite`).
- **`task_persona.ts`:** Update the persona enforcement/prompt generation to correctly output `persist_qa` as an available action, including any rules for its usage.

## Increment 3: Prompt Update
**Files:** `prompts/quality.md`
- **`prompts/quality.md`:** Update the system prompt for the `@quality` bot to instruct it on when and how to use the `persist_qa` action.
