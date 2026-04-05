# Implementation Plan: persist_qa MVP

## Objective
Enable the `@quality` bot to independently write and persist quality assurance artifacts. The `@quality` bot will use `run_shell` to write files to `docs/qa/`, and then call `persist_qa` to persist them.

## Increments

### Increment 1: Protocol and Manifest
- **Files**: `src/utils/agent_protocol.ts`, `bots.json`, `src/bots/bot_config.ts`
- **Action**: Add `persist_qa` action to the protocol schema. Add the `persist_qa` capability to the `@quality` bot in `bots.json` and the loaded runtime config in `src/bots/bot_config.ts`.

### Increment 2: Runtime Execution and Persona Wiring
- **Files**: `src/utils/agent_runner.ts`, `src/personas/task_persona.ts`
- **Action**: Implement the execution logic for `persist_qa` in `AgentRunner` (restricting persistence to the `docs/qa/` directory). Wire the `persist_qa` capability into the task runner in `src/personas/task_persona.ts`.

### Increment 3: Prompts
- **Files**: `prompts/quality.md`
- **Action**: Update the `@quality` bot prompt to instruct it to write QA documents to `docs/qa/` using `run_shell`, and then use the `persist_qa` action to persist those changes.
