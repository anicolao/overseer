# Design: Quality Bot `persist_qa` Action

## Objective
Introduce a `persist_qa` action for the `@quality` bot to independently save QA review documents.

## Action Semantics
Following repository rules, this process requires a two-step approach:
1. **Writing**: The `@quality` bot will use the existing `run_shell` action to create or edit QA files exclusively within the `docs/qa/` directory.
2. **Persisting**: The new `persist_qa` action will be invoked to commit and push these existing local changes. `persist_qa` is purely a persistence trigger and does not accept file content payloads.

## Architecture & Implementation Steps

### 1. Action Parsing Schema (`src/utils/agent_protocol.ts`)
- Define a new action type in the action protocol schema: `{"type": "persist_qa"}`.
- Ensure this is recognized as a valid parsed action with no required payload arguments.

### 2. Runtime Execution (`src/utils/agent_runner.ts`)
- Update `AgentRunner`'s execution loop to handle the `persist_qa` action type.
- When triggered, it will interface with persistence functionality (e.g., from `src/utils/persistence.ts`) to persist the current state of `docs/qa/`.

### 3. Bot Capability Wiring
- **`bots.json`**: Update the `@quality` bot manifest to include a specific capability flag for persisting QA documents (e.g., `"can_persist_qa": true`).
- **`src/bots/bot_config.ts`**: Update the bot configuration types and loaders (like `LoadedBotDefinition`) to parse and expose the `can_persist_qa` capability.
- **`src/personas/task_persona.ts`**: Update the persona runtime instantiation. Read the `can_persist_qa` capability from the loaded bot configuration and inject the corresponding execution permissions into the `AgentRunner`.

### 4. Prompt Instructions (`prompts/quality.md`)
- Modify the `@quality` bot's prompt instructions to explain the workflow.
- Explicitly state:
  - Use `run_shell` to perform the actual writing of QA artifacts into `docs/qa/`.
  - Call `{"type": "persist_qa"}` only after the changes are correctly written to the file system.
