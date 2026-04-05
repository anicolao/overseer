# Overseer Repository Guidance

This repository has two different dispatch layers. Do not confuse them.

## Architecture Map

- `src/dispatch.ts`
  Handles GitHub Actions events, issue comments, persona wakeups, and routing between personas.
  It is not the runtime that executes bot JSON actions like `run_shell`, `replace_in_file`, or any future `persist_qa`.

- `src/utils/agent_protocol.ts`
  Defines and parses the JSON action protocol used by task bots.
  This file is the schema and protocol surface, not the execution layer.

- `src/utils/agent_runner.ts`
  Executes bot JSON actions and enforces loop/persistence rules.
  If a new bot action needs real runtime behavior, this is usually the primary execution seam.

- `src/personas/task_persona.ts`
  Builds the task-bot runtime configuration and injects per-bot capabilities into `AgentRunner`.
  If a new action or permission needs persona-specific wiring, inspect this file.

- `src/bots/bot_config.ts` and `bots.json`
  Define bot configuration, allowed capabilities, and prompt assembly.
  If a design introduces a new bot capability flag, it must be wired through both the manifest and the loaded runtime config.

- `src/utils/persistence.ts`
  Handles branch persistence and git commits for `persist_work`.
  This is separate from the action protocol schema and separate from GitHub event dispatch.

## Design And Planning Rules

- Canonical design docs live under `docs/design/`, and canonical implementation plans live under `docs/plans/`.
- Do not invent parallel directories such as `docs/designs/` for new design work.
- When repairing or writing a design doc, name the actual execution seam, not just a related file.
- Do not describe `src/dispatch.ts` as the handler for bot JSON actions unless the code really routes that specific action there.
- Do not describe `src/utils/agent_protocol.ts` as executing actions. It defines and parses them.
- If a feature adds a new bot action, inspect at least:
  - `src/utils/agent_protocol.ts`
  - `src/utils/agent_runner.ts`
  - `src/personas/task_persona.ts`
  - `src/bots/bot_config.ts`
  - the relevant persona prompt in `prompts/`

## Persist_QA Specific Grounding

For the MVP issue about `persist_qa`, a correct design should distinguish:

- action shape / protocol parsing
- action execution at runtime
- bot capability wiring
- prompt instructions for `@quality`

For this repository specifically:

- the `@quality` prompt text lives in `prompts/quality.md`
- bot manifest/config lives in `bots.json`
- loaded runtime bot config lives in `src/bots/bot_config.ts`
- `src/personas/task_persona.ts` wires runtime capabilities into the task runner; it is not where the quality prompt text is authored
- do not claim there is an `allowed_actions` field unless you verified it exists in the current source
- preserve the user-requested action semantics:
  - `run_shell` is what writes or edits the QA document files under `docs/qa/`
  - `persist_qa` is what persists those existing `docs/qa/` changes
  - do not redesign `persist_qa` as a second file-writing action with its own content payload unless the issue explicitly asks for that

If a design or plan collapses those into one file or assigns them to `src/dispatch.ts`, it is probably still wrong.
