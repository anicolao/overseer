# MVP Task Breakdown

This document breaks down the MVP Design (`MVP_DESIGN.md`) into actionable micro-tasks for implementation.

## Phase 1: Infrastructure & Scaffolding

- **Task 1: Set up GitHub App & Webhook Configuration**
  - Create a GitHub App with necessary repository permissions (Issues, Pull Requests, Contents).
  - Generate and securely store private keys and webhook secrets.
- **Task 2: Initialize Cloud Functions Project**
  - Set up a Node.js/TypeScript project configured for Google Cloud Functions (2nd Gen).
  - Add essential dependencies (`@octokit/rest`, `google-genai`, `express`).
- **Task 3: GitHub Actions CI/CD Setup**
  - Create a workflow to automatically deploy to Google Cloud Functions on pushes to the `main` branch.
  - Configure Google Secret Manager or GitHub Secrets for deployment credentials.
- **Task 4: Setup GitHub Project v2**
  - Create the Overseer project board.
  - Add custom fields: `Persona` (Single Select: Overseer, Product, Architect, Planner, Developer, Quality) and `Actionable` (Single Select: Yes, No).

## Phase 2: Core Integrations

- **Task 5: Implement Webhook Entrypoint**
  - Parse incoming GitHub Webhooks (e.g., `issues.opened`, `issue_comment.created`).
  - Verify webhook signatures.
- **Task 6: Implement GitHub API Wrapper**
  - Create utility functions using `@octokit/rest` for creating issues, adding comments, reading files, and opening PRs.
- **Task 7: Implement LLM Wrapper (Gemini)**
  - Create a service to communicate with Gemini 1.5 Pro via the `google-genai` SDK.
  - Implement a standardized prompt wrapper that injects system instructions based on the active persona.

## Phase 3: Persona Implementation

- **Task 8: Implement Overseer Persona (Orchestrator)**
  - Logic to evaluate current state and delegate to the next appropriate persona based on the MVP Workflow loop.
- **Task 9: Implement Product/Architect Persona**
  - Prompt engineering and logic to translate user vision from issue bodies into concrete requirements and technical designs.
- **Task 10: Implement Planner Persona**
  - Prompt engineering to break down technical designs into sub-issues and checklists.
- **Task 11: Implement Developer/Tester Persona**
  - Logic to clone code (conceptually via API or sandbox), write code/tests based on planned tasks, and submit Pull Requests.
- **Task 12: Implement Quality Persona**
  - Logic to review PR diffs against requirements and either request changes or approve.
