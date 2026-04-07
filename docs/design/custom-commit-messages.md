# Objective

Allow personas to provide a detailed, context-aware commit message when persisting their work.

# Action Semantics

The action protocol schema will be extended to make the `commit_message` field mandatory for both `persist_work` and `persist_qa` actions.

The provided `commit_message` will serve as the primary commit message. The existing standard, automated commit string (e.g., `@developer-tester: issue #42 persist work`) should be appended to this new primary message for traceability.

# Affected Files and Seams

- **`src/utils/agent_protocol.ts`**
  - Update `PersistWorkAction` and `PersistQaAction` interfaces to include `commit_message: string`.
  - Update `parseAction` to parse `record.commit_message` as a required string.

- **`src/utils/persistence.ts`**
  - Update `PersistenceService.persistWork` to accept a `commitMessage: string` parameter.
  - When creating the git commit, use the provided `commitMessage` as the primary message and append the default commit message to it:
    ```typescript
    const finalCommitMessage = `${commitMessage}\n\n${persona}: issue #${issueNumber} ${actionLabel}`;
    ```
  - Update `PersistenceService.persistQa` to accept `commitMessage` and forward it to `persistWork`.

- **`src/utils/agent_runner.ts`**
  - Update `AgentRunnerOptions` to accept `persistWork?: (commitMessage: string) => Promise<PersistWorkResult>` and `persistQa?: (commitMessage: string) => Promise<PersistWorkResult>`.
  - Pass `action.commit_message` into these callback functions when executing `persist_work` and `persist_qa` actions.

- **`src/personas/task_persona.ts`**
  - Update the `persistWork` and `persistQa` closures provided to the agent runner to accept a `commitMessage` string.
  - Pass the `commitMessage` down to `this.persistence.persistWork` and `this.persistence.persistQa`.

# Implementation Steps

1. In `src/utils/agent_protocol.ts`, add `commit_message: string;` to `PersistWorkAction` and `PersistQaAction`.
2. In `src/utils/agent_protocol.ts` inside `parseAction`, extract `commit_message` using a required string parser (e.g., `parseRequiredNonEmptyString`) for `persist_work` and `persist_qa`.
3. In `src/utils/persistence.ts`, add `commitMessage: string` as a parameter to `persistWork` and `persistQa`.
4. In `src/utils/persistence.ts`, modify the git commit message logic to use `commitMessage` as the primary text, followed by the system's tracking string.
5. In `src/utils/agent_runner.ts`, modify `AgentRunnerOptions` so `persistWork` and `persistQa` accept `commitMessage: string`.
6. In `src/utils/agent_runner.ts`, update `executeActions` to call `await options.persistWork(action.commit_message)` (and similarly for `persist_qa`).
7. In `src/personas/task_persona.ts`, update the `persistWork` and `persistQa` lambda implementations in `run` to accept `(commitMessage: string)` and pass it to the underlying `persistence` layer.
