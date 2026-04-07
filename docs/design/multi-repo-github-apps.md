# Multi-Repo Support and Central Management via GitHub Apps

## Objective
Migrate the current single-repo Overseer MVP (which relies on per-repository GitHub Actions and local `GITHUB_TOKEN`s) to an architecture that supports multiple repositories and centralized work management. This will be achieved using a GitHub App and a Hub-and-Spoke repository model.

## Current Architecture Limitations
- **Per-Repo Execution:** `src/dispatch.ts` relies on GitHub Actions context (`GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`) and only operates on the repository where the event fired.
- **Authentication:** Relies on the default GitHub Actions token (`GITHUB_TOKEN`) or a single `GEMINI_API_KEY`/PAT, making cross-repo operations difficult and subject to low rate limits.
- **Scattered Work:** If an organization has 10 repositories, the Overseer queue is fragmented across 10 different issue trackers.

## Proposed Architecture: Hub and Spoke with GitHub App

We will use a **Hub and Spoke** model powered by a **GitHub App**.

1. **GitHub App:** We will register Overseer as a GitHub App. This provides:
   - Webhook delivery to a central service hosted on **Firebase / Google Cloud Functions (GCF)** (replacing the GitHub Actions runner for event dispatch).
   - Higher rate limits.
   - Granular permissions (read/write code, issues, pull requests) across all installed repositories.
   - Secure generation of short-lived Installation Access Tokens.
2. **Hub Repository (Dynamic Setup):** We will support a dynamic setup flow where any repository can act as a hub. By simply installing the Overseer App on the intended hub and spoke repositories, users can route work from an issue in the hub to code changes in the spokes. No hardcoded configuration of a single hub repo is required; the hub is implicitly the repo where the issue is managed.
3. **Spoke Repositories (Code):** The repositories where the actual code modifications take place. The task packet specifies which repository the agents should clone and modify.

### Alternative Considered: Projects V2
We considered using GitHub Projects V2 to aggregate issues from multiple repositories. While visually useful for humans, it introduces complexity for the Overseer bot, which would need to use GraphQL APIs to track project board columns and still navigate multiple issue trackers. A central Hub repo is simpler and leverages the existing issue-comment-driven architecture in `src/dispatch.ts`.

## Affected Seams and Files

- **`src/index.ts` (Webhook Entrypoint):**
  - Currently scaffolds `overseerWebhook`. This will become the primary entry point, receiving webhook payloads from the GitHub App deployed to Firebase/GCF.
  - Implement access control checks to verify the user triggering the webhook.
- **`src/utils/github.ts` (Authentication & API):**
  - Needs to support `@octokit/auth-app` to authenticate as a GitHub App.
  - Must map a given `owner/repo` to an Installation ID to generate an access token dynamically.
- **`src/dispatch.ts` (Event Processing):**
  - Currently assumes the issue repository is the code repository.
  - Must be updated to parse `Target Repository` from the Overseer task packet or issue body.
- **`src/personas/overseer.ts` (Task Routing):**
  - Needs to include `Target Repository: owner/repo` in the task packets sent to `product-architect`, `planner`, etc.
  - Needs to link PRs created in spoke repos back to the Hub issue.
- **`src/utils/persistence.ts` (Git Operations):**
  - Currently assumes it operates in the local GitHub Action checkout.
  - Must clone the Target Repository dynamically, checkout a branch, commit, and push back to the Target Repository using the App Installation token.

## Installation and Access Permissions

To ensure security and restrict who can use Overseer:
- **App Installation Restriction:** The GitHub App installation must be restricted to specific organizations or repositories. When configuring the GitHub App, it should be set to "Private" (only installable on the owner's account/organization) or, if Public, the webhook handler must maintain an explicit allowlist of authorized Installation IDs or Organization IDs.
- **Usage Restriction:** Not every user in a repository should be able to trigger Overseer. The webhook handler in `src/index.ts` must verify the user interacting with the issue/comment. This can be achieved by:
  - Validating the user's role (e.g., must be a `collaborator` with `write` access or an organization `member`).
  - Checking against an explicit allowlist of GitHub usernames or teams authorized to issue commands to Overseer.

## Implementation Steps

1. **GitHub App Authentication Utility:**
   - Add `@octokit/auth-app` dependency to `package.json`.
   - Update `src/utils/github.ts` with an `AppTokenManager` that initializes with `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`.
   - Implement `getInstallationToken(owner, repo)` to dynamically fetch tokens.

2. **Webhook Dispatcher Standup:**
   - Implement the `src/index.ts` webhook handler for deployment to Firebase / GCF.
   - Decouple `src/dispatch.ts` from reading `process.env.GITHUB_EVENT_PATH` and instead accept the event payload directly from the webhook.
   - Add the access and permission boundary checks to drop unauthorized events.

3. **Task Packet Schema Update:**
   - Update task packets in Overseer interactions to include a `Target Repository: owner/repo` field.

4. **Remote Repository Persistence:**
   - Update `src/utils/persistence.ts` to accept `owner` and `repo` parameters.
   - Implement shallow cloning (`git clone --depth 1 https://x-access-token:<token>@github.com/<owner>/<repo>.git`).
   - Run task shell commands inside the cloned repository directory instead of the current working directory.
