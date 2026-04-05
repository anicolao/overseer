# Design: persist_qa MVP

## Objective
Enable the `@quality` bot to independently write and persist quality assurance artifacts.
The `@quality` bot will write QA documents to the `docs/qa/` directory using the existing `run_shell` action, and then call a new `persist_qa` action to persist those existing changes.

## Architecture and Seams

### 1. Protocol Definition and Parsing
- **File**: `src/utils/agent_protocol.ts`
- **Responsibility**: Define the `persist_qa` action schema and parse it from the bot's JSON output. The `persist_qa` action has no file-writing payload.

### 2. Runtime Execution
- **File**: `src/utils/agent_runner.ts`
- **Responsibility**: Execute the `persist_qa` action at runtime, persisting the changes already written to `docs/qa/` by `run_shell`.

### 3. Bot Capability Wiring
- **File**: `bots.json`
- **Responsibility**: Update the bot manifest configuration to grant the `@quality` bot the capability to use the new action.
- **File**: `src/bots/bot_config.ts`
- **Responsibility**: Represent the `persist_qa` capability in the loaded runtime bot configuration.
- **File**: `src/personas/task_persona.ts`
- **Responsibility**: Wire the runtime capabilities into the task runner and authorize the `@quality` bot to invoke `persist_qa` in `AgentRunner`.

### 4. Prompt Instructions
- **File**: `prompts/quality.md`
- **Responsibility**: Instruct the `@quality` bot to use `run_shell` to write or edit QA artifacts under `docs/qa/`, and then call `persist_qa` to persist those changes.

## Excluded Files
- `src/dispatch.ts`: Does not execute or route bot JSON actions like `persist_qa`. It only handles GitHub event dispatch and routing to personas.
