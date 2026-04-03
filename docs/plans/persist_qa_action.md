# Plan: Introduce `persist_qa` Action

## Overview
This plan outlines the steps to introduce a new `persist_qa` action, enable it along with `run_shell` for the Quality bot, and update the Quality prompt to direct detailed QA reports to `docs/qa/`.

## 1. Update Bot Configuration (`bots.json` & `prompts/quality.md`)
- **`bots.json`**: For the `quality` bot, set `"allow_run_shell": true` and `"allow_persist_qa": true`.
- **`prompts/quality.md`**: Add instructions telling the bot to write detailed QA findings to a file in the `docs/qa/` directory and explicitly call `{"type":"persist_qa"}` to save those reports before concluding.

## 2. Update Configuration Parsing (`src/bots/bot_config.ts`)
- Add `allow_persist_qa?: boolean` to the configuration types.
- Parse `allow_persist_qa` from `bots.json`.
- Modify `getSystemPrompt` to conditionally inject `persist_qa` instructions in the protocol description and completion requirements if `allow_persist_qa` is true (similarly to how `allow_persist_work` is handled). 

## 3. Extend Protocol (`src/utils/agent_protocol.ts`)
- Add `{ type: "persist_qa" }` to the `Action` type union.
- In `parseAction`, handle `type === "persist_qa"` and return the action object.
- Update error messages for invalid action types to include `"persist_qa"`.

## 4. Implement Execution Logic (`src/utils/agent_runner.ts`)
- In `executeTurn`, intercept `action.type === "persist_qa"`.
- Verify `persona.config.allow_persist_qa` is true; otherwise, return a permissions error.
- Execute the git commit/push process (either by reusing `callbacks.persistWork()` or adding a new `callbacks.persistQa()` method to `ActionCallbacks`).
- Update state tracking (`hasSuccessfulPersist`, validation for `task_status: "done"`) to accept `persist_qa` alongside `persist_work`.

## 5. Update Shell Outputs (`src/utils/shell.ts`)
- Add `"persist_qa"` to the formatting mappings for terminal output logging.

## 6. Update Tests
- **`src/utils/agent_protocol.test.ts`**: Add test cases for parsing `persist_qa`.
- **`src/utils/agent_runner.test.ts`**: Add test cases simulating successful and unauthorized `persist_qa` calls.
