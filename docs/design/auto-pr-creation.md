# Automated PR Creation Design

## Objective
Automatically create and track Pull Requests when the system completes an increment (like a design doc or initial code) and hands control back to a human review step. This ensures that reviewers have an easily accessible GitHub PR interface to leave comments and review diffs for both the initial design doc and any subsequent implementation work.

## Action Semantics
1. The mechanism hooks into the handoff process. When a task persona completes its work and hands control to `@overseer` who in turn designates the next recipient as `human_review_required`, the system should verify if a Pull Request already exists for the issue branch.
2. If no PR exists, the system will automatically create one.
3. Subsequent work on the same issue will automatically update the PR because GitHub inherently updates PRs when the head branch (e.g., `bot/issue-<n>`) receives new commits via `PersistenceService`.

## Affected Files and Seams

### 1. `src/utils/github.ts`
- **Seams**: The `GitHubService` class already contains `listPullRequests` and `createPullRequest`. We will use these existing methods to check for open PRs and create new ones.

### 2. `src/dispatch.ts`
- **Seams**: The `finalizeRun` function.
- **Role**: This is where the runtime handoff is finalized and the issue comment is constructed.
- **Change**: Inject logic into `finalizeRun` to detect when `result.handoffTo === "human_review_required"`. 
- **Implementation Steps**:
  - When handing off to a human, infer the branch name (e.g., `bot/issue-${issueNumber}`).
  - Call `github.listPullRequests(owner, repo, branchName)` to check if a PR already exists.
  - If the list is empty, fetch the issue title via `github.getIssue` (or pass it through if already loaded).
  - Call `github.createPullRequest(...)` setting the title to reference the issue, the `head` to the issue branch, and the `base` to `main`.
  - Wrap the PR creation in a `try/catch` block to fail gracefully (e.g., if the bot has not actually pushed the branch yet or there are no commits).
  - Optionally, append a link to the created (or existing) PR in the final issue comment so the human reviewer can navigate to it easily.

### 3. `src/utils/persistence.ts`
- **Seams**: Branch naming convention.
- **Role**: The branch naming format is currently isolated inside `PersistenceService.getBranchName(issueNumber)`.
- **Change**: Extract `getBranchName(issueNumber)` into an exported utility function (or expose it publicly on the class/module) so that `src/dispatch.ts` can reliably resolve the exact branch string without duplicating the `bot/issue-<n>` string literal.

## Implementation Steps
1. **Refactor Branch Name**: In `src/utils/persistence.ts`, export a helper function `getIssueBranchName(issueNumber: number): string` and update `PersistenceService` to use it.
2. **Hook Handoff**: In `src/dispatch.ts` inside `finalizeRun`, add the PR creation logic:
   ```typescript
   if (result.handoffTo === "human_review_required") {
       const branchName = getIssueBranchName(issueNumber);
       try {
           const existingPrs = await github.listPullRequests(owner, repo, branchName);
           if (existingPrs.data.length === 0) {
               const issue = await github.getIssue(owner, repo, issueNumber);
               await github.createPullRequest(
                   owner,
                   repo,
                   `Resolve Issue #${issueNumber}: ${issue.data.title}`,
                   `Automated PR for Issue #${issueNumber}.\n\nCloses #${issueNumber}.`,
                   branchName,
                   "main"
               );
           }
       } catch (error) {
           console.error("Failed to ensure PR during human handoff:", error);
       }
   }
   ```
3. **Verify**: Ensure that the bot token has the necessary permissions to create Pull Requests (which standard workflow tokens generally do, provided they have `pull-requests: write`).