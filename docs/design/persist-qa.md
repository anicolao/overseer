# Technical Design: `persist_qa` Action

## Objective
Enable the `@quality` bot to write QA documents under `docs/qa/...` using `run_shell`, and then commit those changes using a new, restricted `persist_qa` action.

## Core Interaction Model
The workflow strictly separates file creation/editing from persistence:
1. **File Modification:** The `@quality` bot uses its authorized `run_shell` action to write or edit QA artifacts (e.g., test plans, QA reports) under the `docs/qa/` directory.
2. **Persistence:** The `@quality` bot invokes the `persist_qa` action. This action takes no payload parameters (no path, no content). It strictly acts as a trigger to commit and push whatever existing uncommitted changes are present in the `docs/qa/` directory.

## Implementation Seams

To implement this feature end-to-end, changes are required across the following repository boundaries:

### 1. Prompt Content (`prompts/quality.md`)
- Update the system prompt for the `@quality` persona.
- Explain the two-step workflow: first use `run_shell` to write files to `docs/qa/...`, then use `persist_qa` to persist them.
- Clarify that `persist_qa` takes no arguments and only saves files in the `docs/qa/` directory.

### 2. Manifest and Configuration (`bots.json`, `src/bots/bot_config.ts`)
- **`bots.json`**: Update the `@quality` bot manifest to include the new `persist_qa` action in its authorized toolset. Ensure it also retains access to `run_shell` for the file-writing step.
- **`src/bots/bot_config.ts`**: Ensure the configuration schema and parsing correctly load the new action for the `@quality` bot.

### 3. Protocol and Schema (`src/utils/agent_protocol.ts`)
- Define the schema for the `persist_qa` action.
- The schema must specify that `persist_qa` takes no arguments (e.g., `{ "type": "persist_qa" }` with no `path` or `content` fields).

### 4. Runtime Execution (`src/utils/agent_runner.ts`)
- Implement the execution logic for the `persist_qa` action.
- The runner must recognize the action and invoke the persistence layer.

### 5. Runtime Wiring (`src/personas/task_persona.ts`)
- Wire the `persist_qa` action into the runtime environment for the `@quality` persona.
- Ensure the persona context makes the tool available when executing tasks.

### 6. Persistence Behavior (`src/utils/persistence.ts`)
- Implement the actual persistence mechanics for `persist_qa`.
- The logic must specifically restrict the git add/commit/push operations to the `docs/qa/` directory.
- It should fail or warn if invoked when there are no changes in `docs/qa/`.
