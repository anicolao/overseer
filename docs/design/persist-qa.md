# Design: persist_qa MVP

## Objective
Add a `persist_qa` action specifically for the `@quality` bot. The `@quality` bot will write quality assurance artifacts to the `docs/qa/` directory using the existing `run_shell` action, and then use the new `persist_qa` action to persist those changes.

## Protocol Definition
- **File**: `src/utils/agent_protocol.ts`
- **Change**: Define a new action type `persist_qa` in the JSON protocol schema.
- **Shape**: `{"type": "persist_qa"}` without any additional payload, as file writing is handled separately by `run_shell`.

## Runtime Execution
- **File**: `src/utils/agent_runner.ts`
- **Change**: Add execution logic to handle the `persist_qa` action. When encountered, it triggers persistence for the changes made to the repository.

## Bot Configuration & Wiring
- **File**: `bots.json`
  - **Change**: Add a capability flag (e.g., `canPersistQA: true`) to the `@quality` bot.
- **File**: `src/bots/bot_config.ts`
  - **Change**: Update the runtime configuration types to load the new capability.
- **File**: `src/personas/task_persona.ts`
  - **Change**: Read the capability from the bot configuration and wire it into the `AgentRunner` so only authorized bots can execute `persist_qa`.

## Prompt Updates
- **File**: `prompts/quality.md`
- **Change**: Update the instructions to explicitly state:
  1. Use `run_shell` to write or edit QA artifacts under `docs/qa/`.
  2. Use the `persist_qa` action to persist those changes once verified.
