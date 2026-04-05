# Implementation Plan: `persist_qa`

Based on the approved design in `docs/design/persist-qa.md`.

## Increment 1: Protocol and Runner Surface
**Files:** `src/utils/agent_protocol.ts`, `src/utils/agent_runner.ts`

- Add `persist_qa` to the protocol action union and parser in `src/utils/agent_protocol.ts`.
- Add a `persistQa` runner option and `persist_qa` action execution path in `src/utils/agent_runner.ts`.
- Keep the action shape minimal; `run_shell` writes the file contents, while `persist_qa` only triggers persistence of existing `docs/qa/` changes.

## Increment 2: Restricted Persistence and Runtime Wiring
**Files:** `src/utils/persistence.ts`, `src/personas/task_persona.ts`

- Add a restricted persistence method in `src/utils/persistence.ts` that stages, commits, and pushes only `docs/qa/` changes.
- Wire that method into `src/personas/task_persona.ts` as the `persistQa` callback for authorized bots.

## Increment 3: Bot Capability Configuration
**Files:** `bots.json`, `src/bots/bot_config.ts`

- Add an explicit `allow_persist_qa` capability to the bot manifest and loaded bot config.
- Enable `run_shell` and `persist_qa` for the `quality` bot without granting it the broader `persist_work` capability.

## Increment 4: Quality Prompt Update
**Files:** `prompts/quality.md`

- Instruct the `@quality` bot that it may write detailed QA notes under `docs/qa/` with `run_shell`.
- Instruct it to use `persist_qa` to store those existing QA notes once they are ready.
