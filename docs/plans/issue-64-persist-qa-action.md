# Implementation Plan: `persist_qa` Action (Issue #64)

## 1. Protocol Update (`src/utils/agent_protocol.ts`)
- Define `PersistQaAction` interface: `{ type: "persist_qa" }`.
- Add to `AgentAction` union type.
- Update `parseAction` to handle and validate `type === "persist_qa"`.
- Update `AGENT_PROTOCOL_PROMPT` to document `{"type": "persist_qa"}` for the quality bot to publish QA findings.

## 2. Runner Update (`src/utils/agent_runner.ts`)
- Update `AgentRunnerOptions` to optionally accept `persistQa?: () => Promise<PersistWorkResult>`.
- In `executeActions`, handle `action.type === "persist_qa"`. Return an error if `persistQa` is unavailable for the persona; otherwise, invoke and return its results.

## 3. Bot Configuration (`bots.json` & Prompts)
- In `bots.json`, update the `quality` bot definition. If introducing a new specific persistence permission, add `"allow_persist_qa": true` (and update bot schema/types in the code).
- Create a shared prompt for the QA persistence (e.g., `prompts/shared/persisting-qa-agent.md`) and attach it to the `quality` bot.

## 4. CLI / Dispatcher Integration
- Ensure wherever `persistWork` is injected into `AgentRunnerOptions`, `persistQa` is also injected when applicable.
