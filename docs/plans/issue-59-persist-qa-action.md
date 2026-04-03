# Plan: Implement `persist_qa` action for @quality

> **Important for Developer:** To prevent timeouts, execute one step at a time. After completing a step, update this file to mark its checkbox `[x]` and call `{"type": "persist_work"}` to save your progress. Do not try to implement all steps in a single response.

### [ ] Step 1: Protocol Update
- **File:** `src/utils/agent_protocol.ts`
- **Task:** Add `persist_qa` as a valid action type to the Zod schema and TypeScript types, alongside `persist_work`, `run_shell`, etc.

### [ ] Step 2: Persistence Service Update
- **File:** `src/utils/persistence.ts`
- **Task:** Modify `stageRelevantChanges` to accept an optional scope (e.g., specific directories to stage). Create a new method `persistQAWork` (or extend `persistWork` with a `scope` argument) that limits the `git add` command specifically to the `docs/qa/` directory rather than staging all files (`.`).

### [ ] Step 3: Agent Runner Update
- **File:** `src/utils/agent_runner.ts`
- **Task:** 
  - Add `persistQAWork?: () => Promise<PersistWorkResult>` to `AgentRunnerOptions`.
  - In `executeActions`, add a condition for `action.type === "persist_qa"`. If called, it should invoke `options.persistQAWork()`. If the bot lacks this option, return an error explaining that `persist_qa` is not available.

### [ ] Step 4: Quality Bot Wiring
- **File:** `src/bots/quality.ts`
- **Task:** Supply the `persistQAWork` function in the `AgentRunnerOptions` when initializing the bot, pointing it to the newly created/modified method in `PersistenceService`.

### [ ] Step 5: Prompts Update
- **File:** `prompts/quality.md`
- **Task:** Document the availability of the `{"type": "persist_qa"}` action. Explicitly instruct the `@quality` persona that it is authorized to modify files exclusively within `docs/qa/...`, and must use `persist_qa` to persist those changes.
