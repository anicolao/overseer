# Implementation Plan: Multi-Repo Management and Projects V2 Integration

This plan breaks down the approved design in `docs/design/multi_repo_management.md` into concrete, incremental implementation steps.

## Increment 1: App Authentication Foundation (Complete)
**Goal**: Integrate GitHub App authentication to replace the static PAT.
- **Files**: `package.json`, `src/utils/github.ts`, `.env` (implicit)
- **Actions**:
  1. Add `@octokit/auth-app` dependency to `package.json`.
  2. Update `GitHubService` constructor in `src/utils/github.ts` to use `@octokit/auth-app` when `APP_ID` and `PRIVATE_KEY` environment variables are present, gracefully falling back to a static PAT if only `GITHUB_TOKEN` is available.
- **Verification**: Ensure unit tests pass for `GitHubService`.

## Increment 2: Projects V2 GraphQL Methods (Complete)
**Goal**: Provide API methods to interact with Projects V2 fields instead of using issue labels.
- **Files**: `src/utils/github.ts`
- **Actions**:
  1. Add a new method `updateProjectV2ItemFieldValue(projectId, itemId, fieldId, optionId)` to `GitHubService` using the GraphQL API.
- **Verification**: Add and run unit tests for `GitHubService` GraphQL query construction.

## Increment 3: Dispatcher Event Handling Testing
**Goal**: Verify that the dispatcher correctly processes `projects_v2_item` events.
- **Files**: `src/dispatch.ts`, `src/dispatch.test.ts`
- **Actions**:
  1. The code for processing `eventName === "projects_v2_item"` was added to `run()` in `src/dispatch.ts`, but `run()` is not exported. Extract the payload parsing logic (like determining `targetedPersonaFromProject`) into an exported helper function.
  2. Add unit tests in `src/dispatch.test.ts` for this helper to ensure it properly parses a mocked `projects_v2_item` payload, verifying the extraction of repository/issue info and persona mapping.
- **Verification**: Ensure the new `projects_v2_item` tests pass.

## Increment 4: Handoff State Management
**Goal**: Update the project board state upon handoff completion instead of applying labels.
- **Files**: `src/dispatch.ts`
- **Actions**:
  1. Modify `finalizeRun` to mutate the Projects V2 item field via `GitHubService.updateProjectV2ItemFieldValue` if the task originated from or is tracked by a project.
  2. Avoid updating issue labels if Project variables are defined.
- **Verification**: Verify that the handoff correctly triggers the GraphQL update method.

## Increment 5: Actions Workflow Integration
**Goal**: Update the central GitHub Actions workflow to run on Projects V2 events.
- **Files**: `.github/workflows/overseer.yml`
- **Actions**:
  1. Add `projects_v2_item` to the `on:` triggers.
  2. Implement logic in the checkout steps to dynamically check out the target repository if the event payload refers to one.
  3. Pass `APP_ID`, `PRIVATE_KEY`, `PROJECT_ID`, and `FIELD_ID` secrets as environment variables to the dispatch step.
- **Verification**: Verify the workflow syntax is valid and passes any CI linting checks.
