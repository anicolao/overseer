# Automated PR Creation Design

## Objective
Automatically create and track Pull Requests when the system completes an increment (like a design doc or initial code) and hands control back to a human review step. This ensures that reviewers have an easily accessible GitHub PR interface to leave comments and review diffs for both the initial design doc and any subsequent implementation work.

## Action Semantics
1. The mechanism hooks into the handoff process. When a task persona completes its work and hands control to `@overseer` who in turn designates the next recipient as `human_review_required`, the system should verify if a Pull Request already exists for the issue branch.
2. If no PR exists, the system will automatically create one and provide a PR description summarizing the change.
3. Subsequent work on the same issue will automatically update the PR because GitHub inherently updates PRs when the head branch receives new commits via `PersistenceService`. When this happens, the system will write a comment on the PR detailing what was updated.

## Affected Files and Seams

### 1. `src/utils/github.ts`
- **Seams**: The `GitHubService` class contains `listPullRequests`, `createPullRequest`, and `addCommentToIssue`.
- **Role**: We will use these existing methods to check for open PRs, create new ones, and add comments to existing ones.

### 2. `src/dispatch.ts`
- **Seams**: The `finalizeRun` function and the `run` function.
- **Role**: This is where the runtime handoff is finalized and the issue comment is constructed.
- **Change**: Inject logic into `finalizeRun` to detect when `result.handoffTo === "human_review_required"`.
- **Implementation Steps**:
  - Pass the `branchName` (already obtained from `persistence.ensureIssueBranch` in `run()`) into `finalizeRun`.
  - Inside `finalizeRun`, when `result.handoffTo === "human_review_required"`, call `github.listPullRequests(owner, repo, branchName)`.
  - If the list is empty (no PR exists):
    - Fetch the issue title via `github.getIssue(owner, repo, issueNumber)`.
    - Create a description for the PR using the original issue reference (`Closes #${issueNumber}`) and `result.finalResponse`.
    - Call `github.createPullRequest(...)` setting the title to reference the issue, the `head` to the issue branch, and the `base` to `main`.
  - If the list is not empty (PR exists):
    - Retrieve the PR number from the first item (`existingPrs[0].number`).
    - Call `github.addCommentToIssue(owner, repo, prNumber, commentBody)`, detailing the latest update from `result.finalResponse`.
  - Wrap the PR creation and comment addition in a `try/catch` block to fail gracefully (e.g., if there are no commits yet).
  - Append a link to the created (or existing) PR in the final issue comment so the human reviewer can navigate to it easily.

### 3. `src/utils/persistence.ts`
- **Seams**: The `ensureIssueBranch` method.
- **Role**: This method is already called in `src/dispatch.ts` and provides `branchState.branchName`. No changes are necessary here as the branch name is already resolved during dispatch.
## Implementation Steps
1. **Update `finalizeRun` Signature**: In `src/dispatch.ts`, update `finalizeRun` to accept a new `branchName: string` parameter.
2. **Pass `branchName` to `finalizeRun`**: In the `run` function of `src/dispatch.ts`, pass `branchState.branchName` to the `finalizeRun` call.
3. **Add PR Logic**: In `src/dispatch.ts` inside `finalizeRun`, add the PR creation and commenting logic.
