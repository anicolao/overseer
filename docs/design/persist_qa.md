# Design: persist_qa Action

## Objective
Add a `persist_qa` action for the `@quality` bot to allow it to persist files modified within the `docs/qa/` directory.

## Action Semantics
- `run_shell`: Used by the `@quality` bot to write or edit QA documents under `docs/qa/`.
- `persist_qa`: A parameterless action (`{"type": "persist_qa"}`) that persists the existing changes made to `docs/qa/`. It does not accept a file payload.

## Affected Files and Implementation Steps

### 1. Protocol Definition
**File:** `src/utils/agent_protocol.ts`
- Update the JSON schema and protocol types to define the new `persist_qa` action.
- The action shape should be exactly `{"type": "persist_qa"}`.

### 2. Execution Runtime
**File:** `src/utils/agent_runner.ts`
- Implement the runtime execution logic for the `persist_qa` action.
- When `persist_qa` is received, it should verify the modifications are restricted to `docs/qa/` and then persist the changes.
- Ensure it is handled separately from file-writing actions (which use `run_shell`).

### 3. Bot Configuration and Capability Wiring
**File:** `bots.json`
- Add the capability flag (e.g., `can_persist_qa`) to the `@quality` bot manifest.

**File:** `src/bots/bot_config.ts`
- Update the loaded runtime configuration interfaces to parse and support the new capability flag.

**File:** `src/personas/task_persona.ts`
- Wire the runtime capability into the task runner. When building the task-bot runtime configuration for the `@quality` persona, ensure the `persist_qa` capability is injected into the `AgentRunner` instance.

### 4. Prompt Instructions
**File:** `prompts/quality.md`
- Update the `@quality` prompt text to instruct the bot on how to use `persist_qa`.
- Explicitly state that the bot must first use `run_shell` to write or edit files in `docs/qa/`, and then call `{"type": "persist_qa"}` to save them.
