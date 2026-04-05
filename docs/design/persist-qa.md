# Technical Design: `persist_qa` Action

## Objective
Enable the `@quality` bot to write QA documents under `docs/qa/...` using `run_shell`, and then commit those changes using a new, restricted `persist_qa` action.

## Core Interaction Model
The workflow strictly separates file creation/editing from persistence:
1. **File Modification:** The `@quality` bot uses its authorized `run_shell` action to create or edit files in `docs/qa/`. It verifies the results locally.
2. **Persistence:** Once verified, the `@quality` bot calls the `persist_qa` action. This action does *not* accept file paths or contents; it simply acts as a trigger to commit whatever uncommitted changes exist in `docs/qa/`.

## Architecture & Wiring

### 1. Protocol Definition (`src/utils/agent_protocol.ts`)
The JSON protocol schema definition. The `persist_qa` action is defined here as a valid literal action type.

### 2. Runtime Execution (`src/utils/agent_runner.ts`)
The `agent_runner.ts` file acts as the execution seam, translating JSON protocol objects into system effects. It must handle the `persist_qa` action by executing a restricted git commit scoped specifically to `docs/qa/`.

### 3. Bot Capability Wiring
We must authorize the `@quality` bot to use the `persist_qa` action, ensuring other bots do not use it inappropriately.

- **`src/personas/task_persona.ts`**: Contains the bot instructions. We update the rules for `@quality` to instruct it to use `persist_qa` instead of `persist_work` when finalizing QA tasks, and list `persist_qa` as an available action.
- **`src/bots/bot_config.ts`**: Maps actions to bots. The `persist_qa` action must be enabled specifically for the `@quality` bot.

## Security and Constraints
- The `persist_qa` action takes no arguments.
- The runtime implementation (`agent_runner.ts`) must enforce that only paths starting with `docs/qa/` are staged and committed.
- The action will fail if changes outside `docs/qa/` are present or if no changes exist in `docs/qa/`.
