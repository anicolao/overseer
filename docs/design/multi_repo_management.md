# Multi-Repo Management and Projects V2 Integration

## Objective
Migrate the Overseer system to operate as a GitHub App to support multiple repositories seamlessly without per-repo token configurations. Transition the control plane from issue labels (`active-persona:*`) to GitHub Projects V2 states.

## Background
Currently, the Overseer system uses a `.github/workflows/overseer.yml` Actions workflow and authenticates using a Personal Access Token (PAT) or the default `GITHUB_TOKEN`. Persona activation state is stored as `active-persona:*` labels on the individual issues.
Scaling to multiple repositories is cumbersome, as it requires workflow duplication and secret management. Additionally, using labels for state is less structured than a centralized project board.

## Architecture

### 1. GitHub App Authentication
To support a multi-repo model naturally, the system will run as a GitHub App.
- **Credentials**: The App will require `APP_ID`, `PRIVATE_KEY`, and `WEBHOOK_SECRET`.
- **Runtime App Authentication**: Replace the static PAT initialization in `src/index.ts` and `src/dispatch.ts` with App-based authentication (e.g., `@octokit/auth-app`) to generate short-lived Installation Access Tokens dynamically based on the repository receiving the event.
- **Webhooks**: `src/index.ts` already exposes an Express-compatible webhook handler (`overseerWebhook`). This endpoint will receive GitHub App webhooks directly instead of relying exclusively on repository-local GitHub Actions workflow runs.

### 2. Projects V2 as the Control Plane
Instead of using `github.setActivePersona` to manage issue labels, the system will use a Projects V2 Single Select field (e.g., "Persona Status") to track which agent has control.

**State Mapping (Project Field Options -> Persona handles)**:
- `Triage` -> `@overseer`
- `Architecting` -> `@product-architect`
- `Planning` -> `@planner`
- `Implementing` -> `@developer-tester`
- `Reviewing` -> `@quality`

**Event Handling**:
- **Listen for Changes**: Extend the webhook handler to process `projects_v2_item` events.
- **Detect Persona Shifts**: When the designated field changes, the system maps the new value to a persona handle and dispatches the task to the respective persona.
- **Update State on Handoff**: When a persona completes a turn and yields via `handoffTo`, the dispatcher updates the Projects V2 item field instead of updating repository issue labels.

## Affected Files and Seams

- `src/index.ts` & `src/dispatch.ts` (Dispatch execution seams):
  - Add handling for the `projects_v2_item` webhook event.
  - Instantiate `GitHubService` using App credentials dynamically.
- `src/utils/github.ts` (API interaction seam):
  - Refactor constructor to accept App authentication credentials and use an App-aware authentication strategy.
  - Add GraphQL mutations to query and update Projects V2 fields (e.g., `updateProjectV2ItemFieldValue`), as the REST API does not fully support Projects V2 operations.
  - Remove or deprecate `setActivePersona` label management.
- Configuration (`.env` / `bots.json`):
  - Add variables for `APP_ID`, `PRIVATE_KEY`, and mapping constants for `PROJECT_ID` and `FIELD_ID`.

## Implementation Steps

1. **GitHub App Scaffolding**: Register a GitHub App with permissions for Issues (R/W), Projects (R/W), and subscribe to `Issue comment`, `Issues`, and `Projects v2 item` events.
2. **App Authentication Seam**: Update `src/utils/github.ts`, `src/index.ts`, and `src/dispatch.ts` to use `@octokit/auth-app`. Retrieve the installation ID from the webhook payload to generate the client.
3. **Projects V2 API Methods**: Implement GraphQL queries in `src/utils/github.ts` to read and write the designated Single Select field on the Projects V2 item.
4. **Webhook Event Processing**: Update the `overseerWebhook` handler in `src/index.ts` (and equivalent logic in `src/dispatch.ts`) to trigger the correct persona when a `projects_v2_item` field change occurs.
5. **Update Handoff Logic**: Modify the `finalizeRun` execution seam to mutate the Projects V2 item field on completion rather than updating the `active-persona` issue label.
