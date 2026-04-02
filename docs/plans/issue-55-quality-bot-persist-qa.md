# Implementation Plan: Enable Quality Bot to Persist QA Docs (Issue #55)

## Objective
The `@quality` bot needs to be able to write detailed QA observations to the repository, specifically within the `docs/qa/` directory. Since we do not want it to arbitrarily commit source code changes via the broad `persist_work` action, we will introduce a targeted `persist_qa` action.

## Implementation Steps

### 1. Update Agent Protocol
- **File:** `src/utils/agent_protocol.ts`
- **Change:** Add `{ type: "persist_qa" }` to the `AgentAction` type.
- **Change:** Update the `parseAction` and other validation logic to accept `persist_qa`.

### 2. Update Bot Configuration
- **File:** `src/bots/bot_config.ts`
- **Change:** Add `allow_persist_qa?: boolean;` to the `BotConfig` interface and parsing logic.
- **File:** `bots.json`
- **Change:** Update the `quality` bot entry to include `"allow_persist_qa": true`.
- **Change:** Remove `prompts/shared/read-only-agent.md` from the `quality` bot's `prompt_files` list, as it is no longer entirely read-only.

### 3. Update Agent Runner & Task Persona
- **File:** `src/utils/agent_runner.ts`
- **Change:** Modify `RunOptions` to accept an optional `persistQa: () => Promise<PersistWorkResult>`.
- **Change:** Add execution handling for the `persist_qa` action type, checking if it is allowed and executing it.
- **File:** `src/personas/task_persona.ts`
- **Change:** Inject the `persistQa` callback for bots that have `allowPersistQa` set to true, pointing to the existing `persistence.persistWork` method (or a specialized `persistQa` method if we want to enforce the `docs/qa/` path restriction in code).

### 4. Provide Targeted Prompts for the Quality Bot
- **File:** `prompts/quality.md`
- **Change:** Explain the availability of the `persist_qa` action.
- **Change:** Explicitly instruct the bot that it should write its detailed observations and reports to `docs/qa/...` (e.g., using `run_shell` to create/edit files) and then call `{"type": "persist_qa"}` when done.
- **File (Optional):** Create `prompts/shared/persisting-qa-agent.md` if we need reusable instructions on how to handle `persist_qa` failure/retries, similar to `persisting-agent.md`.

## Security & Safety
Ensure `persist_qa` utilizes the dispatcher-owned persistence mechanism so that changes are pushed to the current issue branch, allowing human review before merging to `main`.
