# Design: persist_qa Capability

## Objective
Enable the `@quality` bot to independently persist QA documentation and findings. The capability must be added cleanly, preserving the strict separation of concerns between protocol parsing, runtime execution, persona wiring, and prompt instructions.

## Action Semantics
- `run_shell`: Used to write or edit the QA document files locally under `docs/qa/`.
- `persist_qa`: A new, dedicated action that commits and persists only the existing `docs/qa/` changes. It must not be designed as a payload-carrying file-writing action; it solely persists the local changes previously created by `run_shell`.

## Affected Files and Seams

### 1. Action Protocol Schema
- **File:** `src/utils/agent_protocol.ts`
- **Responsibility:** Defines and parses the JSON action protocol.
- **Change:** Add `PersistQaAction` interface. Update `AgentAction` and `parseAction` to recognize `{"type": "persist_qa"}` without any payload arguments.

### 2. Runtime Execution
- **File:** `src/utils/agent_runner.ts`
- **Responsibility:** Executes bot JSON actions.
- **Change:** Update the `executeActions` method to process the `persist_qa` action. Delegate the execution to a dedicated callback in `AgentRunnerOptions` (similar to how `persistWork` is handled). Return an appropriate denial message if the capability is invoked but not configured for the active persona.

### 3. Bot Configuration and Manifest
- **Files:** `bots.json`, `src/bots/bot_config.ts`
- **Responsibility:** Defines bot configurations and allowed capabilities.
- **Change:** Introduce a new boolean flag `allow_persist_qa` (in JSON: `allow_persist_qa`) in `RawBotDefinition` and `LoadedBotDefinition`. Enable this flag for the `@quality` bot in `bots.json`. Additionally, set `shell_access` to `read_write` for `@quality` in `bots.json` to allow it to execute `run_shell` for authoring the files.

### 4. Runtime Wiring
- **File:** `src/personas/task_persona.ts`
- **Responsibility:** Builds the task-bot runtime configuration and injects per-bot capabilities into the runner.
- **Change:** Map the `allow_persist_qa` bot configuration flag to a runner callback for persistence (e.g. passing a `persistQa` method from the persistence service into `AgentRunnerOptions`).

### 5. Persona Prompt
- **File:** `prompts/quality.md`
- **Responsibility:** Contains the prompt text instructing the bot on its role and capabilities.
- **Change:** Update the instructions to explain the two-step workflow: first use `run_shell` to write QA files to `docs/qa/`, and then call `persist_qa` to persist those changes to the branch.

## Implementation Steps
1. Update `src/bots/bot_config.ts` to include `allowPersistQa`. Modify `bots.json` to set `"allow_persist_qa": true` and `"shell_access": "read_write"` for the `@quality` bot.
2. Update `src/utils/agent_protocol.ts` to support the `persist_qa` action schema.
3. Update `src/utils/agent_runner.ts` to execute `persist_qa` using an optional callback.
4. Update `src/personas/task_persona.ts` to wire the runtime persistence function into the runner if `allowPersistQa` is true.
5. Update `prompts/quality.md` with instructions on how to use `run_shell` and `persist_qa` in sequence.
