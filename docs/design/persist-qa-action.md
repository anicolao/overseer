# Design: persist_qa Action

## Objective
Introduce a new `persist_qa` action to allow the `@quality` bot to autonomously persist quality assurance artifacts. This enables end-to-end autonomous QA workflows without bleeding broad product code persistence privileges into the quality role.

## Action Semantics
File writing is strictly separated from persistence to maintain user-requested semantics:
- **`run_shell`**: Executed by the `@quality` bot to write or edit QA document files directly inside the `docs/qa/` directory.
- **`persist_qa`**: A parameter-less action (`{"type": "persist_qa"}`) that explicitly persists the staged changes in `docs/qa/`. It does not accept a file-writing payload.

## Affected Files and Implementation Steps

### 1. `src/utils/agent_protocol.ts`
- Add `{ type: "persist_qa" }` to the `Action` or equivalent type schema that defines permitted bot JSON actions.

### 2. `src/utils/agent_runner.ts`
- Add execution handling for `persist_qa` inside the action runner loop.
- When encountered, trigger persistence scoped to the QA output.

### 3. `bots.json`
- Add a new boolean capability flag (e.g., `canPersistQA: true`) to the `@quality` bot's manifest entry.

### 4. `src/bots/bot_config.ts`
- Update the bot configuration schema to load, parse, and type the new `canPersistQA` flag from `bots.json`.

### 5. `src/personas/task_persona.ts`
- Update the persona wiring to read the capability from the loaded bot config.
- Explicitly grant the `persist_qa` capability to the `AgentRunner` when initializing the runtime for `@quality`.

### 6. `prompts/quality.md`
- Update the `@quality` bot prompt to specifically instruct it to:
  1. Use `run_shell` to author and refine documents exclusively in `docs/qa/`.
  2. Issue `persist_qa` to persist the drafted QA documents once complete.

## Human Decisions
- None unresolved. The planner can proceed autonomously with this design.
