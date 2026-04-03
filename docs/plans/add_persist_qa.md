# Implementation Plan: Add `persist_qa` for Quality Bot

## 1. Action Protocol Updates (`src/utils/agent_protocol.ts`)
- Add `export interface PersistQaAction { type: "persist_qa"; }`.
- Include `PersistQaAction` in the `AgentAction` union type.
- Update `parseAction()` to recognize and validate `type === "persist_qa"`.
- Update `AGENT_PROTOCOL_PROMPT` to document `persist_qa`.

## 2. Runner Updates (`src/utils/agent_runner.ts`)
- Add `persistQa?: () => Promise<PersistWorkResult>` to `AgentRunnerOptions`.
- Update `executeActions()` to handle `action.type === "persist_qa"`. Call `options.persistQa()` if provided; otherwise, return a structured error indicating it is not available for the persona.

## 3. Configuration Updates (`src/bots/bot_config.ts`)
- Add `allow_persist_qa?: boolean` to `RawBotDefinition` and `LoadedBotDefinition`.
- Update `loadBotDefinition()` to extract and map `allow_persist_qa`.
- Update prompt assembly functions (`buildAvailableActionsBullets`, `buildExampleActionsJson`, `buildShellActionRules`) to surface `persist_qa` when `allowPersistQa` is true.

## 4. Bot Manifest Updates (`bots.json`)
- For the `quality` bot:
  - Change `"shell_access": "read_only"` to `"read_write"`.
  - Add `"allow_persist_qa": true`.
  - Replace `prompts/shared/read-only-agent.md` with `prompts/shared/persisting-agent.md` in its `prompt_files`.

## 5. Prompt Updates (`prompts/quality.md`)
- Instruct the Quality bot to write its evaluation reports to `docs/qa/`.
- Explicitly direct it to call the `{"type": "persist_qa"}` action to commit and push those reports once complete.
