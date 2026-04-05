# Design: Persist QA Action

## Objective
Enable the `quality` bot to write detailed observation documents and save them in the `docs/qa/` directory. This requires granting the bot `run_shell` access to create files locally and implementing a new `persist_qa` action to commit and push these specific changes.

## Proposed Changes

### 1. Bot Configuration (`bots.json`)
The `quality` bot definition must be updated to grant the necessary capabilities:
- Change `"shell_access"` from `"read_only"` to `"read_write"` so it can use `run_shell` to create/edit files.
- Replace `"prompts/shared/read-only-agent.md"` in its `prompt_files` with a new prompt file, such as `"prompts/shared/qa-agent.md"`.
- Add support for the new action, e.g., by checking for `"allow_persist_qa": true` or explicitly enabling it for the quality bot.

### 2. Prompt Updates
- **`prompts/shared/qa-agent.md`**: Create this new file to provide specific instructions for the QA bot:
  - Authorize the use of `run_shell` for creating and editing files exclusively within the `docs/qa/` directory.
  - Forbid modifying implementation code or using `persist_work`.
  - Explain the usage and purpose of the new `{"type":"persist_qa"}` action.
- **`prompts/quality.md`**: Update if necessary to align with the new capabilities, reminding the bot that it can write detailed reports to `docs/qa/`.

### 3. Action Handler (`persist_qa`)
- Implement a new JSON action `"type": "persist_qa"`.
- The action handler should behave similarly to `persist_work` but enforce a path constraint: it should only stage, commit, and push files located in the `docs/qa/` directory.
- Update the top-level schema and action parser to recognize `persist_qa`.

## Security & Constraints
- The `quality` bot should still be restricted from altering product code. The `persist_qa` action enforces this by limiting commits to `docs/qa/`.
- The bot retains `"allow_persist_work": false` to prevent it from using the unrestricted persist action.
