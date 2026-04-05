# Implementation Plan: persist_qa via Gemini CLI

This plan is based on the approved design in `docs/design/persist-qa.md` and provides step-by-step increments for implementation.

## Increment 1: Protocol Schema Update
**Goal:** Define the new `persist_qa` action in the protocol types.
**Files:**
- `src/utils/agent_protocol.ts`

**Steps:**
1. In `src/utils/agent_protocol.ts`, export a new interface `PersistQAAction` with `type: "persist_qa"`.
2. Add `PersistQAAction` to the `AgentAction` union type.

## Increment 2: Bot Configuration & Manifest Updates
**Goal:** Enable the `@quality` bot to use `run_shell` and `persist_qa`.
**Files:**
- `bots.json`
- `src/bots/bot_config.ts`

**Steps:**
1. In `bots.json`, update the `"quality"` bot entry to change `"shell_access": "read_only"` to `"shell_access": "read_write"`.
2. Also in `bots.json`, add `"allow_persist_qa": true` to the `"quality"` bot entry.
3. In `src/bots/bot_config.ts`:
   - Add `allow_persist_qa?: boolean` to the `RawBotDefinition` interface.
   - Add `allowPersistQa: boolean` to the `LoadedBotDefinition` interface.
   - In `loadBotDefinition`, extract `allow_persist_qa` from `rawBot` (defaulting to `false`), map it to `allowPersistQa`, and pass it in the `context` object to `loadPromptAssembly` and `renderPromptTemplate`.
   - In `buildAvailableActionsBullets`, add a condition: if `context.allowPersistQa` is true, append documentation for `persist_qa` to the bullets. (You may create a new partial file `prompts/partials/available-actions/persist-qa-enabled.md` or just inline the explanation for `persist_qa`).

## Increment 3: Runtime Execution & Wiring
**Goal:** Connect the `persist_qa` action to the actual runner and persist the work when requested.
**Files:**
- `src/utils/agent_runner.ts`
- `src/personas/task_persona.ts`
- `src/utils/persistence.ts`

**Steps:**
1. In `src/utils/agent_runner.ts`:
   - Add `persistQa?: () => Promise<PersistWorkResult>;` to `AgentRunnerOptions`.
   - In `executeActions`, add a branch to handle `action.type === "persist_qa"`. 
   - If `action.type === "persist_qa"` but `options.persistQa` is undefined, return an error mimicking the `persist_work` denial. Otherwise, await `options.persistQa()` and push the result to `results`.
2. In `src/utils/persistence.ts`:
   - Add `persistQa(issueNumber: number, botId: string): Promise<PersistWorkResult>` to `PersistenceService`, behaving similarly to `persistWork`. (It may just delegate to a shell script or the same generic path).
3. In `src/personas/task_persona.ts`:
   - Update `AgentRunnerOptions` mapping in the runner to include `persistQa: this.bot.allowPersistQa ? () => this.persistence.persistQa(issueNumber, this.bot.id) : undefined`.

## Increment 4: Prompt Updates
**Goal:** Instruct the `@quality` bot on how to use its new capabilities.
**Files:**
- `prompts/quality.md`

**Steps:**
1. Modify `prompts/quality.md` to explicitly instruct the bot to:
   - Use `run_shell` to write its QA reports locally (e.g., to `docs/qa/`).
   - Call the `persist_qa` action to publish the changes once they are verified locally.
