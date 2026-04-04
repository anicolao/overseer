# Plan: Add `persist_qa` action and enable `run_shell` for Quality Bot

## Overview
Enable the `quality` bot to write detailed observation documents using `run_shell` and save them securely using a new `persist_qa` action. These documents will be persisted in the `docs/qa/...` directory.

## Implementation Steps

### 1. Update Configuration (`bots.json`)
- Find the `quality` bot definition.
- Add `run_shell` to its list of allowed actions (or corresponding action partials) so it can execute shell commands to write documents.
- Ensure `persist_qa` is defined in the action partials and available to the `quality` bot.

### 2. Update Protocol Schema (`src/utils/agent_protocol.ts`)
- Extend the `AgentAction` type and schema (e.g., Zod schemas) to include `{ type: "persist_qa" }`.

### 3. Update Runner Logic (`src/utils/agent_runner.ts`)
- Extend `AgentRunnerOptions` to include an optional `persistQa?: () => Promise<PersistWorkResult>` callback (similar to `persistWork`).
- In the action execution loop, handle the `persist_qa` action by invoking the `persistQa` callback if present, or returning a denial if it is not supported in the current run context.

### 4. Implement Action Handlers (Dispatcher / CLI Entry Points)
- Where `runAgent` is called (likely in `src/commands/dispatch.ts` or similar entry points), supply the `persistQa` callback.
- The callback implementation should stage, commit, and push changes specifically in the `docs/qa/` directory (or use a shared git commit/push helper focused on docs/qa).

### 5. Update Prompt (`prompts/quality.md`)
- Document the new capability for the `quality` bot.
- Instruct the bot to use `run_shell` to write its QA observations to files in `docs/qa/`.
- Explicitly direct the bot to call the `persist_qa` action after writing the files to save its work.

## Verification
- Run type checking and tests to ensure `agent_protocol.ts` and `agent_runner.ts` changes are valid.
- Use `npm run start` or the bot CLI to trigger the `quality` bot and ensure it recognizes `persist_qa`.
