# Implementation Plan: Multi-Repo GitHub Apps

This plan decomposes the approved design `docs/design/multi-repo-github-apps.md` into actionable implementation increments.

## Step 1: Implement GitHub App Authentication Utility
**Goal:** Set up dynamic token generation using a GitHub App.
- Add `@octokit/auth-app` as a dependency in `package.json`.
- Edit `src/utils/github.ts`:
  - Create an `AppTokenManager` class or utility initialized with `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` environment variables.
  - Implement a `getInstallationToken(owner: string, repo: string)` function to dynamically fetch short-lived installation access tokens.
- Add basic unit tests for the token management logic.

## Step 2: Decouple Dispatch and Implement Webhook Entrypoint
**Goal:** Support webhook event payloads and stand up the handler.
- Edit `src/dispatch.ts`:
  - Refactor to accept the GitHub event payload and context explicitly as function arguments instead of relying on `process.env.GITHUB_EVENT_PATH` and global GitHub Actions environment variables.
- Edit `src/index.ts`:
  - Implement a webhook payload handler designed for Firebase/Google Cloud Functions.
  - Add access and permission boundary checks (e.g., verifying user role, collaborator status, or allowlist) to drop unauthorized events before passing them to the dispatcher.

## Step 3: Update Task Packet Schema
**Goal:** Enable task packets to specify a target repository.
- Edit `src/utils/task_packet.ts`:
  - Add parsing support for a `Target Repository: owner/repo` field in the task packet format.
- Edit `src/personas/overseer.ts`:
  - Update Overseer's logic to extract the `Target Repository` when processing issue comments or creating tasks.
  - Ensure task packets sent to other agents (e.g., product-architect, planner, developer-tester) include the `Target Repository` field.
  - Ensure PRs created in spoke repos can be linked back to the Hub issue.
- Update `prompts/overseer.md` (and other relevant prompt files) to instruct Overseer on generating and managing the `Target Repository` field.

## Step 4: Remote Repository Persistence and Execution
**Goal:** Clone remote repositories dynamically and perform git operations.
- Edit `src/utils/persistence.ts`:
  - Update persistence functions to accept `owner` and `repo` parameters.
  - Implement logic to perform a shallow clone (`git clone --depth 1 https://x-access-token:<token>@github.com/<owner>/<repo>.git`) into a temporary directory if a target repository is specified.
  - Ensure branches, commits, and pushes are performed against the cloned remote repository using the installation token.
- Edit `src/utils/shell.ts` and `src/utils/agent_runner.ts` (as applicable):
  - Ensure that shell commands executed by task agents run within the cloned repository directory rather than the local GitHub Action checkout.