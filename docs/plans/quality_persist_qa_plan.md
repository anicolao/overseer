# Implementation Plan: Add `persist_qa` action for `@quality` bot

## Objective
Allow the `@quality` bot to generate and save documents specifically inside the `docs/qa/...` directory by adding a new `persist_qa` action and granting it `run_shell` access.

## Step-by-Step Implementation

### 1. Update `bots.json`
- Locate the entry for the `quality` bot.
- Update its `allowed_actions` array to include `"run_shell"` and `"persist_qa"`.

### 2. Update Agent Protocol (`src/utils/agent_protocol.ts`)
- In the `ActionType` type definition, add `"persist_qa"` as a valid action type.
- Update the Zod schema representing actions to allow `persist_qa`. The schema should not require additional parameters, similar to `persist_work`.
- Provide a description in the schema explaining that `persist_qa` persists documents generated in `docs/qa/...`.

### 3. Update Agent Runner (`src/utils/agent_runner.ts`)
- In the `executeActions` function, add a new `case "persist_qa":` block to handle the new action.
- Ensure the handler logic calls the necessary Git/persistence utility methods to push the changes (likely via `persistence.ts`).
- Enforce path restrictions: the handler should verify that any modifications or new files are strictly contained within `docs/qa/` before calling the persist mechanism.

### 4. Update Quality Bot Prompt (`prompts/quality.md`)
- Add instructions detailing the bot's new capabilities.
- Explain that it can use `run_shell` to create or edit files specifically inside the `docs/qa/` directory.
- Explain that it must use the `persist_qa` action when it is ready to publish/save these QA documents.
