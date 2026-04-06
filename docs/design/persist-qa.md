# Design: persist_qa for Quality Bot

## Objective
Allow the `@quality` bot to write QA files into `docs/qa/` and persist those changes autonomously, without granting the bot full repository persistence rights.

## Action Semantics
We will keep file modification and persistence as distinct operations:
1. **Write**: The bot uses `run_shell` to write QA files directly into the `docs/qa/` directory.
2. **Persist**: The bot uses a new `persist_qa` action to persist those changes. 

This approach preserves the existing design pattern where `run_shell` performs the write and a separate persistence action saves the work. We will not collapse both behaviors into a single payload-bearing `persist_qa` action.

## Affected Files and Seams

- **`prompts/quality.md`**: Update prompt instructions so the bot knows it can generate QA reports in `docs/qa/` and use `persist_qa` to save them.
- **`bots.json`**: Update the `quality` bot configuration:
  - Change `"shell_access"` to `"read_write"` to enable `run_shell`.
  - Add a new `"allow_persist_qa": true` property.
- **`src/bots/bot_config.ts`**: Update the manifest and config types to support `allow_persist_qa`.
  - Add `allowPersistQa: boolean` to `LoadedBotDefinition`.
  - Update `loadBotDefinition` to parse it.
  - Update prompt assembly (`buildAvailableActionsBullets`, etc.) to inject the correct `persist_qa` instructions when enabled.
- **`src/utils/agent_protocol.ts`**: Add `persist_qa` to the protocol schema.
  - Define `PersistQaAction` interface with `type: "persist_qa"`.
  - Add it to the `AgentAction` union.
  - Update `parseAction` to parse `persist_qa` correctly.
- **`src/utils/agent_runner.ts`**: Add runtime execution for `persist_qa`.
  - Update `AgentRunnerOptions` to accept an optional `persistQa?: () => Promise<PersistWorkResult>` callback.
  - Update `executeActions` to execute the `persist_qa` action. If the callback is undefined, return an error that `persist_qa` is unavailable.
  - Update state tracking (`updateProgressState`, `validateDoneResponse`, `buildProgressReminder`) so that successful execution of `persist_qa` satisfies the persistence requirement for write actions.
- **`src/personas/task_persona.ts`**: Wire the runtime dependencies.
  - When setting up `runnerOptions`, if `this.bot.allowPersistQa` is true, pass a `persistQa` callback that triggers persistence (e.g., delegating to `persistence.persistQa(...)`).
  - Add similar fallback logic for `persistQa` to the Gemini CLI execution path, so CLI execution will also auto-persist QA work when `allowPersistQa` is true.

## Implementation Steps
1. Define `PersistQaAction` in `src/utils/agent_protocol.ts`.
2. Add `allow_persist_qa` handling to `src/bots/bot_config.ts`.
3. Modify `src/utils/agent_runner.ts` to execute and track `persist_qa`.
4. Wire the action in `src/personas/task_persona.ts`.
5. Update `bots.json` to grant the `quality` bot `read_write` shell access and `allow_persist_qa`.
6. Update `prompts/quality.md` with instructions on how to use `run_shell` and `persist_qa` together.