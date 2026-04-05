# Implementation Plan: persist_qa MVP

## Objective
Implement the `persist_qa` action for the `@quality` bot to independently write and persist quality assurance artifacts. The `@quality` bot will use `run_shell` to write files to `docs/qa/`, and `persist_qa` to persist them.

## Increments

### Increment 1: Protocol and Manifest Updates
- **Files**: `src/utils/agent_protocol.ts`, `bots.json`, `src/bots/bot_config.ts`
- **Actions**:
  - Update `src/utils/agent_protocol.ts` to include the new `persist_qa` action type in the protocol schema.
  - Update `bots.json` to add `can_persist_qa` capability to the `quality` bot. Ensure `can_run_shell` is enabled for writing files.
  - Update `src/bots/bot_config.ts` to load the new `can_persist_qa` capability flag.

### Increment 2: Runtime Execution and Wiring
- **Files**: `src/utils/agent_runner.ts`, `src/personas/task_persona.ts`
- **Actions**:
  - Update `src/utils/agent_runner.ts` to handle the execution of the `persist_qa` action.
  - Update `src/personas/task_persona.ts` to wire the new `persist_qa` capability into the `AgentRunner` for the quality persona.

### Increment 3: Prompt Update
- **Files**: `prompts/quality.md`
- **Actions**:
  - Edit `prompts/quality.md` to instruct the `@quality` bot to write/edit files under `docs/qa/` using `run_shell` and to persist them using `persist_qa`.
