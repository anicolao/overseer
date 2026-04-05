# Implementation Plan: `persist_qa`

Based on the approved design in `docs/design/persist-qa.md`.

## Increment 1: Protocol and Runner Surface
**Files:** `src/utils/agent_protocol.ts`, `src/utils/agent_runner.ts`
- Add `persist_qa` action to the protocol union and parser in `src/utils/agent_protocol.ts`.
- Add a `persistQa` boolean option to `AgentRunnerOptions` in `src/utils/agent_runner.ts`.
- Implement the `persist_qa` action execution path in `AgentRunner` to commit changes.

## Increment 2: Capability Wiring
**Files:** `bots.json`, `src/bots/bot_config.ts`, `src/personas/task_persona.ts`
- Add `canPersistQa` to the configuration schema in `bots.json` and `src/bots/bot_config.ts`.
- Set `canPersistQa: true` for the `@quality` bot in `bots.json`.
- In `src/personas/task_persona.ts`, pass `persistQa: config.canPersistQa` when instantiating `AgentRunner`.

## Increment 3: Prompt Instructions
**Files:** `prompts/quality.md`
- Update the `@quality` bot prompt to specify that it should use `run_shell` to create or modify QA documents under `docs/qa/`, and then call `persist_qa` to persist those changes.
