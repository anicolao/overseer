# Objective

Allow personas to provide a detailed, context-aware commit message when persisting their work.

# Action Semantics

The action protocol schema will be extended to support a `commit_message` field for both `persist_work` and `persist_qa` actions. If omitted, the system will fall back to the existing default short messages ("persist work" and "persist qa").

When a custom commit message is provided, it should be appended to the standard, automated commit subject line so that the standard prefix (e.g., `@developer-tester: issue #42 persist work`) is preserved for traceability.

# Affected Files and Seams

- **`src/utils/agent_protocol.ts`**
  - Update `PersistWorkAction` and `PersistQaAction` interfaces to include `commit_message?: string`.
  - Update `parseAction` to parse `record.commit_message` as an optional string.

- **`src/utils/persistence.ts`**
  - Update `PersistenceService.persistWork` to accept a `customCommitMessage?: string` parameter.
  - When creating the git commit, if `customCommitMessage` is provided, append it to the default commit message as the commit body:
    ```typescript
    let commitMessage = `${persona}: issue #${issueNumber} ${actionLabel}`;
    if (customCommitMessage) {
        commitMessage += `\n\n${customCommitMessage}`;
    }
    ```
  - Update `PersistenceService.persistQa` to accept `customCommitMessage` and forward it to `persistWork`.

- **`src/utils/agent_runner.ts`**
  - Update `AgentRunnerOptions` to accept `persistWork?: (commitMessage?: string) => Promise<PersistWorkResult>` and `persistQa?: (commitMessage?: string) => Promise<PersistWorkResult>`.
  - Pass `action.commit_message` into these callback functions when executing `persist_work` and `persist_qa` actions.

- **`src/personas/task_persona.ts`**
  - Update the `persistWork` and `persistQa` closures provided to the agent runner to accept an optional `commitMessage` string.
  - Pass the `commitMessage` down to `this.persistence.persistWork` and `this.persistence.persistQa`.

# Implementation Steps

1. In `src/utils/agent_protocol.ts`, add `commit_message?: string;` to `PersistWorkAction` and `PersistQaAction`.
2. In `src/utils/agent_protocol.ts` inside `parseAction`, extract `commit_message` using `parseOptionalNonEmptyString(record.commit_message, 'actions[' + index + '].commit_message')` for `persist_work` and `persist_qa`.
3. In `src/utils/persistence.ts`, add `customCommitMessage?: string` as a fourth parameter to `persistWork` and as a third parameter to `persistQa`.
4. In `src/utils/persistence.ts`, modify the git commit message logic to include the `customCommitMessage` body.
5. In `src/utils/agent_runner.ts`, modify `AgentRunnerOptions` so `persistWork` and `persistQa` accept an optional `commitMessage?: string`.
6. In `src/utils/agent_runner.ts`, update `executeActions` to call `await options.persistWork(action.commit_message)` (and similarly for `persist_qa`).
7. In `src/personas/task_persona.ts`, update the `persistWork` and `persistQa` lambda implementations in `run` to accept `(commitMessage?: string)` and pass it to the underlying `persistence` layer.
