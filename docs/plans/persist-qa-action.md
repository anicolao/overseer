# Implementation Plan: `persist_qa` Action Handler

This plan details the implementation of Section 3 of the `persist-qa.md` design. Each step is designed as a small, isolated increment to ensure smooth implementation and prevent developer timeout.

## Increment 1: Update Agent Protocol Schema
**File:** `src/utils/agent_protocol.ts`
- Add `{ "type": "persist_qa" }` to the permitted JSON action schema.
- Update the top-level `Action` TypeScript type/interface to include the `PersistQaAction` type.
- Ensure the parser/validator accepts this action without errors.

## Increment 2: Update Bot Configuration for Authorization
**File:** `src/bots/bot_config.ts`
- Add an `allow_persist_qa?: boolean` property to the bot configuration type definitions.
- This ensures the `persist_qa` action can be selectively authorized for specific bots (like the `quality` bot).

## Increment 3: Scaffold the Action Handler in Runner
**File:** `src/utils/agent_runner.ts`
- Add a branch in the action processing logic for `action.type === 'persist_qa'`.
- Implement a basic authorization check: ensure the current bot's configuration has `allow_persist_qa: true`. If not, return an authorization error message to the bot.
- Return a placeholder success message to verify routing works before attempting git operations.

## Increment 4: Implement Git Logic for `persist_qa`
**File:** `src/utils/agent_runner.ts`
- Replace the placeholder by implementing the specific git commands in the `persist_qa` handler.
- Enforce the path constraint: Use `git add docs/qa/` to strictly stage only files in the QA directory.
- Execute the commit function with an appropriate message (e.g., "QA: Add observation document").
- Execute the push function (mimicking how `persist_work` pushes to the branch).
- Return a success message with the persistence status back to the bot.
