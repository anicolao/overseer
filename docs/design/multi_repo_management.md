# Multi-Repo Management and Projects V2 Integration

## Objective
Migrate the Overseer system to operate as a GitHub App to support multiple repositories seamlessly without per-repo token configurations. Transition the control plane from issue labels (`active-persona:*`) to GitHub Projects V2 states, while retaining the use of GitHub-hosted Action runners for execution.

## Background
Currently, the Overseer system uses a `.github/workflows/overseer.yml` Actions workflow and authenticates using a Personal Access Token (PAT) or the default `GITHUB_TOKEN`. Persona activation state is stored as `active-persona:*` labels on the individual issues.
Scaling to multiple repositories is cumbersome, as it requires workflow duplication and secret management. Additionally, using labels for state is less structured than a centralized project board.

## Architecture

### 1. GitHub App Authentication
To support a multi-repo model naturally, the system will use a GitHub App for authentication rather than static PATs.
- **Credentials**: The App will require `APP_ID` and `PRIVATE_KEY`.
- **Runtime App Authentication**: Replace the static PAT initialization in `src/index.ts` and `src/dispatch.ts` with App-based authentication (e.g., `@octokit/auth-app`) to generate short-lived Installation Access Tokens dynamically based on the target repository.

### 2. Hosting and Execution Environment (Retaining GitHub Actions)
Instead of moving to a serverless platform, Overseer will continue to use **GitHub-hosted Action runners**.
- **Centralized Workflows**: To avoid duplicating `.github/workflows/overseer.yml` across all repositories, a central "hub" repository can host the primary GitHub Actions workflows.
- **Native Triggering**: Workflows can natively listen to `projects_v2_item` events (e.g., `on: projects_v2_item`) to respond to project board changes without a standalone server.
- **Execution Seams**: By retaining GitHub Actions, agents keep the natural execution environment containing a local checkout and implicit access to CLI tools via the project's Nix configuration (`flake.nix`). The workflow will check out the target repository dynamically before invoking the agent personas (`TaskPersona` and `OverseerPersona`), ensuring the `run_shell` and `run_ro_shell` seams function correctly.

### 3. Projects V2 as the Control Plane
Instead of using `github.setActivePersona` to manage issue labels, the system will use a Projects V2 Single Select field (e.g., "Persona Status") to track which agent has control.

**State Mapping (Project Field Options -> Persona handles)**:
- `Triage` -> `@overseer`
- `Architecting` -> `@product-architect`
- `Planning` -> `@planner`
- `Implementing` -> `@developer-tester`
- `Reviewing` -> `@quality`

**Event Handling**:
- **Listen for Changes**: Use the native `projects_v2_item` GitHub Actions trigger to wake up the central workflow.
- **Detect Persona Shifts**: When the designated field changes, the workflow payload (`github.event.projects_v2_item` and `github.event.changes`) identifies the new state. The system maps the new value to a persona handle and dispatches the task to the respective persona.
- **Update State on Handoff**: When a persona completes a turn and yields via `handoffTo` (in `src/utils/handoff.ts` or `src/dispatch.ts`), the dispatcher updates the Projects V2 item field via GraphQL instead of updating repository issue labels.

## Affected Files and Seams

- `.github/workflows/overseer.yml` (or equivalent central workflow):
  - Add the `projects_v2_item` trigger.
  - Update checkout steps to clone the target repository dynamically based on the event payload.
- `src/index.ts` & `src/dispatch.ts` (Dispatch execution seams):
  - Add handling for the `projects_v2_item` GitHub Actions event payload.
  - Instantiate `GitHubService` using App credentials dynamically.
- `src/utils/github.ts` (API interaction seam):
  - Refactor constructor to accept App authentication credentials and use an App-aware authentication strategy.
  - Add GraphQL mutations to query and update Projects V2 fields (e.g., `updateProjectV2ItemFieldValue`), as the REST API does not fully support Projects V2 operations.
  - Remove or deprecate `setActivePersona` label management.
- Configuration (`.env` / `bots.json`):
  - Add variables for `APP_ID`, `PRIVATE_KEY`, and mapping constants for `PROJECT_ID` and `FIELD_ID`.

## Implementation Steps

1. **GitHub App Scaffolding**: Register a GitHub App with permissions for Issues (R/W), Projects (R/W), and subscribe to `Issue comment`, `Issues`, and `Projects v2 item` events.
2. **App Authentication Seam**: Update `src/utils/github.ts`, `src/index.ts`, and `src/dispatch.ts` to use `@octokit/auth-app`.
3. **Projects V2 API Methods**: Implement GraphQL queries in `src/utils/github.ts` to read and write the designated Single Select field on the Projects V2 item.
4. **Workflow Configuration**: Update the GitHub Actions workflow in `.github/workflows/overseer.yml` to trigger on `projects_v2_item`. Configure steps to check out the target repository where the issue/item originates.
5. **Event Processing**: Update the dispatch logic in `src/index.ts` and `src/dispatch.ts` to trigger the correct persona when a `projects_v2_item` field change occurs.
6. **Update Handoff Logic**: Modify the execution seam (like `finalizeRun` or `HandoffService`) to mutate the Projects V2 item field on completion rather than updating the `active-persona` issue label.
