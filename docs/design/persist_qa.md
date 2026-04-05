# Design: persist_qa Action

## Objective
Add a `persist_qa` action for the `@quality` bot to allow it to persist files modified within the `docs/qa/` directory.

## Action Semantics
- **`run_shell`**: Used by the `@quality` bot to write or edit QA documents under `docs/qa/`.
- **`persist_qa`**: A parameterless action (`{"type": "persist_qa"}`) that persists the changes made to `docs/qa/` by prior `run_shell` commands. It does not take a file-writing payload and does not duplicate file-writing behaviors.

## Affected Files and Seams

### Protocol Schema (`src/utils/agent_protocol.ts`)
- Define the `PersistQaAction` schema/interface with `type: "persist_qa"`.
- Update the action union (e.g., `AnyAgentAction`) to include `PersistQaAction`.

### Execution Runtime (`src/utils/agent_runner.ts`)
- Add handling for `"persist_qa"` in the runtime execution layer (the action switch/loop).
- The handler will execute the persistence logic (e.g., via `src/utils/persistence.ts`) specifically for changes in `docs/qa/`.

### Bot Configuration (`src/bots/bot_config.ts` & `bots.json`)
- **`src/bots/bot_config.ts`**: Update the loaded runtime bot config schema to include a capability flag, such as `can_persist_qa` (boolean).
- **`bots.json`**: Update the manifest to add `"can_persist_qa": true` to the `@quality` bot.

### Runtime Wiring (`src/personas/task_persona.ts`)
- Extract the `can_persist_qa` capability from the loaded bot configuration.
- Inject this capability into the `AgentRunner` so it is authorized to execute the `persist_qa` action for the `@quality` bot.

### Prompt Instructions (`prompts/quality.md`)
- Update the prompt content for the `@quality` bot to explain how to use `run_shell` to modify QA files and `persist_qa` to persist them.
- Emphasize that `persist_qa` does not accept a payload and requires prior `run_shell` execution to create/modify the files.

## Implementation Steps
1. Update `src/utils/agent_protocol.ts` to define the action.
2. Update `src/bots/bot_config.ts` and `bots.json` to configure the capability.
3. Update `src/personas/task_persona.ts` to wire the capability into the runner.
4. Update `src/utils/agent_runner.ts` to execute the action.
5. Update `prompts/quality.md` to instruct the `@quality` bot on usage.
