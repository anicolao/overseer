# Implementation Plan: Add `persist_qa` Action

## Overview
Enable the `quality` bot to write QA reports via `run_shell` and persist them using a new `persist_qa` action. This specialized action restricts the persistence to `docs/qa/...` so that the bot can record QA evidence without having the broader permissions of `persist_work`.

## 1. `bots.json`
- Update the `quality` bot configuration:
  - Change `"shell_access"` to `"read_write"` to allow `run_shell` for writing files.
  - Add a new flag `"allow_persist_qa": true`.
  - Keep `"allow_persist_work": false` to ensure it cannot persist general codebase changes.

## 2. `src/bots/bot_config.ts`
- **Interfaces**:
  - Add `allow_persist_qa?: boolean;` to `RawBotDefinition`.
  - Add `allowPersistQa: boolean;` to `LoadedBotDefinition`.
- **Parsing Logic (`loadBotDefinition`)**:
  - Read and parse `allow_persist_qa` as a boolean.
  - Pass `allowPersistQa` into the `context` for `loadPromptAssembly` and `renderPromptTemplate`.
- **Prompt Generation**:
  - Update `buildAvailableActionsBullets` to conditionally include:
    `'- `{"type":"persist_qa"}` for dispatcher-owned persistence of QA reports. Use this to save changes made in `docs/qa/...`.'` when `allowPersistQa` is true.

## 3. `src/utils/agent_protocol.ts`
- **Types and Interfaces**:
  - Define `export interface PersistQaAction { type: "persist_qa"; }`.
  - Add `PersistQaAction` to the `AgentAction` union type.
- **Protocol Parsing (`parseAction`)**:
  - Add a branch to parse and validate `type === "persist_qa"`.
- **System Prompt (`AGENT_PROTOCOL_PROMPT`)**:
  - Include `{"type":"persist_qa"}` in the list of available actions.

## 4. `src/utils/agent_runner.ts`
- **Runner Options**:
  - Extend `AgentRunnerOptions` with an optional `persistQa?: () => Promise<PersistWorkResult>` callback.
- **Action Execution (`executeActions`)**:
  - Add a block for `action.type === "persist_qa"`.
  - If `options.persistQa` is undefined, return an error (`persist_qa_not_available`).
  - Otherwise, call `await options.persistQa()` and record the result.
- **Progress Tracking**:
  - Update `updateProgressState` to recognize `persist_qa` as a valid persistence event, setting `state.persistSucceededAfterWrite = true` if successful.
  - Update validation functions (`validateDoneResponse`, `buildProgressReminder`) to handle `persist_qa` analogously to `persist_work` when evaluating if a write action has been safely persisted.
