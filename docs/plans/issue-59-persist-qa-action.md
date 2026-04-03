# Plan: Implement `persist_qa` action for @quality

## 1. Update `AgentProtocol`
- **File:** `src/utils/agent_protocol.ts`
- **Change:** Add `persist_qa` as a valid action type to the Zod schema and TypeScript types, alongside `persist_work`, `run_shell`, etc.

## 2. Update `PersistenceService`
- **File:** `src/utils/persistence.ts`
- **Change:** Modify `stageRelevantChanges` to accept an optional scope (e.g., specific directories to stage). Create a new method `persistQAWork` (or extend `persistWork` with a `scope` argument) that limits the `git add` command specifically to the `docs/qa/` directory rather than staging all files (`.`).

## 3. Update `AgentRunner` and Options
- **File:** `src/utils/agent_runner.ts`
- **Change:** 
  - Add `persistQAWork?: () => Promise<PersistWorkResult>` to `AgentRunnerOptions`.
  - In `executeActions`, add a condition for `action.type === "persist_qa"`. If called, it should invoke `options.persistQAWork()`. If the bot lacks this option, return an error explaining that `persist_qa` is not available.

## 4. Update the `@quality` Bot Invocation
- **File:** `src/bots/quality.ts` (or the equivalent entry point where the `@quality` bot is executed)
- **Change:** Supply the `persistQAWork` function in the `AgentRunnerOptions` when initializing the bot, pointing it to the newly created/modified method in `PersistenceService`.

## 5. Update Prompts
- **File:** `prompts/quality.md`
- **Change:** Document the availability of the `{"type": "persist_qa"}` action. Explicitly instruct the `@quality` persona that it is authorized to modify files exclusively within `docs/qa/...`, and must use `persist_qa` to persist those changes.
