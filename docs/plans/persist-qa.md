# Implementation Plan: `persist_qa` Action

This plan decomposes the approved design from `docs/design/persist-qa.md` into actionable steps.

## Step 1: Update Action Schema and Dispatcher
**Objective:** Add support for the `persist_qa` action in the central action dispatcher.
**Tasks:**
- Locate the action dispatcher.
- Add schema validation/definition for `persist_qa` expecting `type: "persist_qa"`, `path` (must start with `docs/qa/`), and `content`.
- Implement the handler logic:
  - Ensure the target directory (`docs/qa/...`) exists (e.g., using `mkdir -p`).
  - Write `content` to `path`.
  - Add the new file to git (`git add <path>`).
  - Return a success message with the path written.

## Step 2: Update `@quality` Bot Prompt
**Objective:** Grant `@quality` access to `run_shell` and `persist_qa`.
**Tasks:**
- Edit `prompts/quality.md`.
- Add `run_shell` to the list of available actions to allow the bot to run linters, tests, or other inspection commands.
- Add `persist_qa` to the list of available actions.
- Add instructions requiring the use of `persist_qa` to finalize and record the QA review. Specify that the path must be under `docs/qa/`.

## Step 3: End-to-End Verification
**Objective:** Verify that the dispatcher correctly executes `persist_qa` and the quality bot prompt is updated.
**Tasks:**
- Run the dispatcher locally or trigger a test action with a payload calling `persist_qa` to confirm the file is created and staged.
- Read `prompts/quality.md` to ensure the new actions are documented correctly.
