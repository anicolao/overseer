# Technical Design: `persist_qa` Action

## Objective
Introduce a `persist_qa` action that saves quality assurance output directly to `docs/qa/...` and grant the `@quality` bot access to this action as well as `run_shell`.

## Motivation
Currently, quality assurance outputs might not be structured or persisted effectively by the `@quality` bot. By giving it dedicated permissions to run shell commands to execute tests and a `persist_qa` action to save results, we ensure that test plans, coverage reports, and QA logs are systematically stored.

## Proposed Changes

### 1. `src/utils/agent_protocol.ts`
- **Action Type Addition**: Add `"persist_qa"` to the union of allowed action types.
- **Action Interface**:
  ```typescript
  export interface PersistQAAction {
    type: "persist_qa";
    path: string;     // The destination path under docs/qa/
    content: string;  // The QA report or results to save
  }
  ```
- **Parsing/Validation**: Update `parseAction` to recognize and validate the `persist_qa` action type, ensuring `path` starts with `docs/qa/`.

### 2. Action Execution
- **Action Handler**: In the action executor (where actions are handled), implement the logic for `persist_qa`.
- **Logic**: Write `content` to `path` relative to the repository root. Ensure the directory `docs/qa/` exists or is created as needed.

### 3. `src/bots/bot_config.ts`
- **Bot Permissions**: Add a new boolean flag `allow_persist_qa?: boolean;` to the bot configuration schema.
- **Bot Registry Update**: Enable `allow_persist_qa: true` and `allow_run_shell: true` for the `@quality` bot definition.

### 4. `prompts/quality.md`
- **Prompt Update**: Update the `@quality` bot's prompt to instruct it on the usage of `persist_qa` and `run_shell`.
  - Detail that it must use the `persist_qa` action to write its findings or test outputs into `docs/qa/`.

### 5. `prompts/shared/persisting-agent.md`
- **Shared Instructions**: Ensure any shared prompt text about actions correctly reflects that agents might have specialized persistence actions like `persist_qa` if authorized, and clarify the distinction between `persist_work` and `persist_qa`.

## Security & Scoping
- `persist_qa` must validate that the target path strictly falls under the `docs/qa/` directory to prevent arbitrary file writes.
- `run_shell` access for the `@quality` bot runs within the standard isolated environment, allowing it to execute tests safely.

## Definition of Done
- `persist_qa` action is fully defined, parsed, and handled in the codebase.
- `@quality` bot configuration is updated with `allow_persist_qa: true` and `allow_run_shell: true`.
- `prompts/quality.md` explicitly instructs the bot on utilizing the `persist_qa` and `run_shell` actions.
- Action handling enforces writing only to `docs/qa/`.
