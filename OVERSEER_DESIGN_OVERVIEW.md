# Overseer Design Overview

The Overseer system is built on top of GitHub Actions, Issues, and Pull Requests to orchestrate a team of LLM-based agents.

## Architectural Components

### 1. The Command Repository (Overseer)
This is the central repository where high-level goals are defined as GitHub Issues. It contains the "Overseer" persona's core logic and configuration.

### 2. Specialized Agent Personas
Each agent (e.g., Developer, Architect, Tester) is implemented as a GitHub Action or a standalone service triggered by GitHub events. They communicate by:
- Creating GitHub Issues.
- Posting comments on Issues and PRs.
- Creating and reviewing Pull Requests.

### 3. Communication Protocol
The system uses standard GitHub features as its "API":
- **Issue Descriptions:** Detailed task specifications.
- **Comments:** Discussion, status updates, and agent-to-agent feedback.
- **Labels:** State management (e.g., `status:in-progress`, `agent:developer`, `needs-human-input`).
- **Milestones:** Project tracking and deadline management.

## Key Personas

- **The Overseer:**
  - High-level orchestrator.
  - Monitors all linked repositories.
  - Responds to new issues in the Command Repo.
  - Decomposes tasks and delegates to other agents.
  - Determines when human intervention is needed.
- **The Architect:**
  - Designs system-wide changes.
  - Reviews proposed implementations for architectural consistency.
- **The Developer:**
  - Implements specific features and bug fixes.
  - Creates Pull Requests.
- **The Tester:**
  - Writes and executes tests.
  - Validates PRs from a functional perspective.

## Implementation via GitHub Actions

- **Event-Driven Execution:** Agents are triggered by GitHub events (`issue_comment`, `issues`, `pull_request`, `push`).
- **Execution Context:** GitHub Actions provide a secure, isolated environment for agents to run tests and build code.
- **Integration:** The system leverages `gh` (GitHub CLI) for almost all repository-level interactions.

## Security and Guardrails

- **Human-in-the-Loop (HITL):** Critical actions (like merging to main or pushing to production) require human approval.
- **Resource Constraints:** GitHub Actions quotas provide natural limits on agent activity.
- **Permission Scoping:** Each agent operates with the minimum necessary GitHub token permissions.
