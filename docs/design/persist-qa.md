# Design: persist_qa MVP

## Objective
Enable the `@quality` bot to independently write and persist quality assurance artifacts. The `@quality` bot will write QA documents to the `docs/qa/` directory using the existing `run_shell` action, and then call a new `persist_qa` action to persist those existing changes.

## Architecture and Seams

### 1. Protocol Definition and Parsing
- **File**: `src/utils/agent_protocol.ts`
- **Responsibility**: Define the JSON action schema and parser for the `persist_qa` action type. It takes no payload since the files are written by `run_shell`.

### 2. Runtime Execution
- **File**: `src/utils/agent_runner.ts`
- **Responsibility**: Execute the `persist_qa` action. This layer will invoke the underlying git persistence logic for the QA files.

### 3. Bot Configuration and Capability Wiring
- **File**: `bots.json`
  - **Responsibility**: Define the manifest for the `@quality` bot, declaring the capability to use `persist_qa`.
- **File**: `src/bots/bot_config.ts`
  - **Responsibility**: Load the bot configuration from `bots.json` and represent it at runtime.
- **File**: `src/personas/task_persona.ts`
  - **Responsibility**: Wire the runtime capabilities into the `AgentRunner`, enabling the `@quality` persona to execute the `persist_qa` action.

### 4. Prompt Instructions
- **File**: `prompts/quality.md`
  - **Responsibility**: Instruct the `@quality` bot on its workflow: use `run_shell` to write QA artifacts to `docs/qa/`, and then call `persist_qa` to persist the work.

## Implementation Steps
1. Update `src/utils/agent_protocol.ts` to add `persist_qa` to the valid action schemas.
2. Update `src/utils/agent_runner.ts` to handle the `persist_qa` execution, persisting changes in `docs/qa/`.
3. Update `bots.json` and `src/bots/bot_config.ts` to define and load the new capability.
4. Update `src/personas/task_persona.ts` to wire the capability into the runner.
5. Update `prompts/quality.md` with instructions on using `run_shell` for editing and `persist_qa` for persistence.
