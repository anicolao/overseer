# Implementation Plan: persist_qa MVP

This plan breaks down the approved design (`docs/design/persist_qa_action.md`) into executable increments.

## Increment 1: Protocol Schema & Bot Config
- **Files to edit**: `src/utils/agent_protocol.ts`, `src/bots/bot_config.ts`, `bots.json`
- **Actions**:
  - In `src/utils/agent_protocol.ts`, define `PersistQAActionSchema` as `z.object({ type: z.literal("persist_qa") })` and add it to the `ActionSchema` union.
  - In `src/bots/bot_config.ts`, add `can_persist_qa?: boolean` to the `BotConfig` interface.
  - In `bots.json`, add `"can_persist_qa": true` to the `quality` bot.

## Increment 2: Task Persona Wiring
- **Files to edit**: `src/personas/task_persona.ts`
- **Actions**:
  - Add `canPersistQA?: boolean` to `TaskPersonaOptions` and ensure it propagates to `AgentRunnerOptions`.
  - In `TaskPersona.create`, read `botConfig.can_persist_qa` and map it to the runner options.

## Increment 3: Agent Runner Execution
- **Files to edit**: `src/utils/agent_runner.ts`
- **Actions**:
  - In `runLoop` or the action handler switch, add handling for `persist_qa`.
  - Enforce permission: if `!options.canPersistQA`, return an action error indicating unauthorized action.
  - If authorized, invoke the underlying branch persistence functionality (similar to how `persist_work` saves changes).

## Increment 4: Quality Prompt Updates
- **Files to edit**: `prompts/quality.md`
- **Actions**:
  - Add clear instructions specifying the two-step workflow: first, use `run_shell` to write or edit files inside `docs/qa/`, and second, use the new `{"type": "persist_qa"}` action to save those changes.
