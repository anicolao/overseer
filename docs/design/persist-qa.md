# Design: persist_qa via Gemini CLI

## Objective
Enable the `@quality` bot to write QA verification reports to the repository and persist them, using standard file edits via `run_shell` and a new action `persist_qa` that publishes those changes. 

## Action Semantics
- `run_shell`: Used by the `@quality` bot to write or update QA documents locally under `docs/qa/`.
- `persist_qa`: A new JSON protocol action that persists those existing `docs/qa/` changes to the repository. It does not carry file contents in the payload; it simply captures what is already written to disk.

## Affected Files and Implementation Steps

### 1. Protocol / Schema (`src/utils/agent_protocol.ts`)
- Define `PersistQAAction` schema (`{ type: "persist_qa" }`).
- Add `PersistQAAction` to the `AgentAction` union type.

### 2. Runtime Execution (`src/utils/agent_runner.ts`)
- Add `persistQa?: () => Promise<PersistWorkResult>;` to `AgentRunnerOptions`.
- Inside `executeActions`, add a branch to handle `action.type === "persist_qa"`. 
- If `persist_qa` is called but `options.persistQa` is undefined, return an error mimicking the `persist_work` denial. Otherwise, await `options.persistQa()` and report the results.

### 3. Runtime Wiring (`src/personas/task_persona.ts`)
- In `AgentRunnerOptions` mapping, wire up `persistQa: this.bot.allowPersistQa ? () => this.persistence.persistQa(issueNumber, this.bot.id) : undefined`.
- Note: This assumes `persistQa` is added to `src/utils/persistence.ts` mirroring `persistWork`.

### 4. Manifest / Config (`src/bots/bot_config.ts` and `bots.json`)
- **`bots.json`**: Update the `quality` bot entry to have `"shell_access": "read_write"` (to permit `run_shell`) and add a new boolean field `"allow_persist_qa": true`.
- **`src/bots/bot_config.ts`**:
  - Add `allow_persist_qa?: boolean` to `RawBotDefinition` and `allowPersistQa: boolean` to `LoadedBotDefinition`.
  - Update `loadBotDefinition` to parse and map `allow_persist_qa` (defaulting to `false`).
  - Update the prompt assembly logic to inject `persist_qa` documentation into the available actions bullets when `allowPersistQa` is true.

### 5. Prompt Content (`prompts/quality.md`)
- Update `prompts/quality.md` with explicit instructions:
  1. Use `run_shell` to write the QA report to `docs/qa/`.
  2. Call the `persist_qa` action to publish the changes once they are verified locally.

## Unresolved Human Decisions
None. This design is implementation-ready and can proceed autonomously. Planning can commence to flesh out the file changes outlined.
