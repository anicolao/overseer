# Implementation Plan: Persist QA Action

Based on the approved design `docs/designs/persist-qa.md`.

## Increment 1: Agent Protocol Updates
**Objective**: Define the `persist_qa` action in the protocol.
**Files**:
- `src/utils/agent_protocol.ts`
**Tasks**:
- Define `PersistQAAction` interface with `type: "persist_qa"`.
- Add `PersistQAAction` to the `AgentAction` union type.
- Update `parseAction` to recognize and parse the `persist_qa` action type.

## Increment 2: Persistence Layer Updates
**Objective**: Implement the `persistQA` method to strictly stage and commit QA artifacts.
**Files**:
- `src/utils/persistence.ts`
**Tasks**:
- Add a new method `persistQA(issueNumber: number, persona: string)` to `PersistenceService`.
- Implement `stageQARelevantChanges(branch: string)` to execute `git add -A -- docs/qa/` (and exclude ignorable paths).
- Ensure `persistQA` fetches, checks branches, stages using `stageQARelevantChanges`, and pushes similarly to `persistWork()`.
- Refactor common commit/push logic between `persistWork` and `persistQA` to avoid excessive duplication, while enforcing the `docs/qa/` boundary.

## Increment 3: Prompt Updates
**Objective**: Instruct the Quality bot to utilize the new capabilities.
**Files**:
- `prompts/quality.md`
**Tasks**:
- Update instructions to explicitly grant the bot permission to create/update files in `docs/qa/` using `run_shell`.
- Define the expected format for QA reports and test plans.
- Instruct the bot to explicitly call the `persist_qa` action when its local QA observations are ready to be pushed to the repository.
