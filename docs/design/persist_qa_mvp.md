# Persist QA MVP Design

## Objective
Design a `persist_qa` action that enables the `@quality` bot to write QA findings to files in `docs/qa/` and persist those changes securely. This requires parsing the new action shape in the protocol schema, wiring it through agent execution and bot config, and updating the bot prompt.

## Action Semantics
To preserve the requested semantics from the issue body:
- `run_shell` is what writes or edits the QA document files under `docs/qa/`.
- `persist_qa` is what persists those existing `docs/qa/` changes (e.g. creating the QA branch or commit).
- `persist_qa` does not take a file payload itself. It acts as the persistence operation for files already written by `run_shell`.

## Affected Files and Seams

### Protocol Schema (`src/utils/agent_protocol.ts`)
Add the new action shape for `persist_qa`:
```typescript
export interface PersistQaAction {
        type: "persist_qa";
}
```
Update the `AgentAction` union type to include `PersistQaAction`.

### Manifest and Config Wiring (`bots.json` and `src/bots/bot_config.ts`)
- **`bots.json`**:
  Update the `quality` bot manifest:
  - Change `shell_access` to `"read_write"` (so it can use `run_shell` for authoring in `docs/qa/`).
  - Add a new capability flag `"allow_persist_qa": true`.
- **`src/bots/bot_config.ts`**:
  - Add `allow_persist_qa?: boolean` to `RawBotDefinition`.
  - Add `allowPersistQa: boolean` to `LoadedBotDefinition`.
  - Parse `allow_persist_qa` inside `loadBotDefinition`.
  - Expose `allowPersistQa` in the context parameter of `loadPromptAssembly` and related functions.

### Runtime Execution (`src/utils/agent_runner.ts`)
- Add an optional `persistQa?: () => Promise<PersistWorkResult>` to `AgentRunnerOptions`.
- Inside `AgentRunner.executeActions`, add a block to handle `action.type === "persist_qa"`.
  - If `options.persistQa` is provided, execute it and capture the result.
  - If not provided, return a denial message indicating `persist_qa` is not available.
- Track `persist_qa` in `RunnerProgressState` to fulfill done-verification rules similarly to `persist_work`.

### Runtime Wiring (`src/personas/task_persona.ts`)
- In `TaskPersona.handleTask`, map `this.bot.allowPersistQa` into the `persistQa` option on `RunnerOptions`.
- Pass a callback (e.g., `() => this.persistence.persistQA(...)`) when creating `RunnerOptions`, enabling the actual persistence mechanism for the quality bot.

### Prompt Updates (`prompts/quality.md`)
- Update the text instructions in `prompts/quality.md`.
- Explicitly instruct the `@quality` bot to use `run_shell` (or `replace_in_file`) to write QA documentation files to `docs/qa/`.
- Instruct the bot that after writing, it must call the `persist_qa` action to save the changes.
- Ensure the prompt does not conflate the two steps (i.e. `persist_qa` must not be used to bypass `run_shell`).

## Implementation Steps
1. Add `PersistQaAction` to `src/utils/agent_protocol.ts`.
2. Add `allow_persist_qa` fields to `src/bots/bot_config.ts`.
3. Modify `bots.json` to change the `quality` bot to `read_write` shell access and set `"allow_persist_qa": true`.
4. Update `src/personas/task_persona.ts` to pass a `persistQa` callback.
5. Update `src/utils/agent_runner.ts` to execute `persist_qa` actions using the injected callback.
6. Edit `prompts/quality.md` with instructions separating `run_shell` file creation and `persist_qa` persistence.