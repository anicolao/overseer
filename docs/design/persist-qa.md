# Technical Design: `persist_qa` Action

## Objective

Introduce a `persist_qa` action that saves quality assurance output directly to `docs/qa/...` and grant the `@quality` bot access to this action.

## Motivation

Currently, quality assurance outputs might not be structured or persisted effectively by the `@quality` bot. By giving it dedicated permissions to persist QA results via a specific action, we can ensure consistent documentation of test plans, test results, and QA feedback.

## Architecture

The bot interaction model involves JSON-based actions that are passed between the LLM and the runtime environment.

### 1. Protocol Definition (`src/utils/agent_protocol.ts`)

The JSON action protocol definition lives in `src/utils/agent_protocol.ts`. This file should be updated to define the new `persist_qa` action type, specifying its required fields (e.g., `filename`, `content`).

### 2. Runtime Execution (`src/utils/agent_runner.ts`)

The execution of these actions happens in `src/utils/agent_runner.ts`. We need to implement the execution seam for `persist_qa` here. When the runtime encounters a `persist_qa` action, it should take the provided content and write it to the specified path under `docs/qa/`.

### 3. Bot Capability Wiring

To allow the `@quality` bot to use the new `persist_qa` action, its capabilities must be correctly wired up.

- **`src/personas/task_persona.ts`**: The prompt construction and available action documentation for each persona are defined here. The `@quality` persona should be updated to instruct the bot to use the `persist_qa` action to save its results.
- **`src/bots/bot_config.ts`**: The actual permissions for which actions are allowed for which bot are defined here. We need to explicitly add `persist_qa` to the allowed actions for the `@quality` bot.

## Execution Plan

1. **Protocol Update**: Add `persist_qa` interface to `agent_protocol.ts`.
2. **Runtime Support**: Implement the file writing logic for `persist_qa` inside `agent_runner.ts`.
3. **Persona Update**: Update `@quality` instructions in `task_persona.ts` to instruct the bot to use the new action.
4. **Config Update**: Add the action permission to the quality bot's config in `bot_config.ts`.
5. **Verification**: Run the quality bot and verify that it successfully creates files in `docs/qa/`.
