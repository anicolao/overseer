# MVP Design: Overseer Self-Bootstrapping (Simplified)

The goal of the Overseer MVP is to reach a state of "self-hosting" as quickly as possible. This means Overseer should be able to manage its own development tasks and implement features through its own persona-based workflow.

## Core Objective
Implement a functional "loop" where a human provides a high-level vision in a GitHub Issue, and the system autonomously drives that vision to a Pull Request through a coordinated team of AI personas.

## Minimum Necessary Infrastructure

1. **The Overseer Hub (Backend):**
   - **Google Cloud Functions (2nd Gen):** Hosting the webhook endpoints. Leveraging the generous free tier (2M invocations/month, 5GB egress).
   - **Language:** TypeScript/Node.js.
   - **GitHub Integration:** Using `@octokit/rest` for all platform interactions.
   - **AI Integration:** Direct calls to Gemini 1.5 Pro (via `google-genai` SDK) for persona "brains."

2. **GitHub Project v2 Configuration:**
   - A single project board to aggregate issues and PRs across the ecosystem.
   - Essential Custom Fields:
     - `Persona`: (Overseer, Product, Architect, Planner, Developer, Quality)
     - `Actionable`: (Yes/No) - A flag set by the Planner and reviewed by Overseer/Architect.

3. **Core Personas (MVP):**
   - **Overseer:** The orchestrator. Reviews high-level output and manages the hand-off between Definition, Design, and Execution.
   - **Product/Architect:** (Combined for MVP) Translates vision into requirements and high-level technical design.
   - **Planner:** Breaks down the design into small, actionable GitHub Issues.
   - **Developer/Tester:** (Combined for MVP) Implements code and includes basic tests in the PR.
   - **Quality:** Performs code review and verifies the implementation against the original requirements.

## MVP Workflow: The "Surgical" Loop

1. **Vision:** Human creates an Issue in the `overseer` repo.
2. **Definition & Design:** Overseer tasks **Product/Architect** to define requirements and a technical approach. Overseer reviews.
3. **Planning:** Overseer tasks **Planner** to create sub-tasks (as new Issues).
4. **Alignment:** Overseer, Product/Architect, and Planner iterate in comments until the plan is marked `Actionable: Yes`.
5. **Execution:** **Developer** implements a task and opens a PR.
6. **Verification:** **Quality** reviews the PR. Once approved, it waits for human merge.

## Success Metrics

- Overseer successfully implements a small change to its own codebase (e.g., adding a new label or updating a persona's prompt).
- The entire flow (Vision -> PR) completes with only one points of human intervention (Initial Approval of the Plan).
- The system remains within the free tiers of Google Cloud and GitHub.

## Deployment Strategy

- **GitHub Apps:** One App with multiple "Persona" installations or a single App that switches context based on the task. (MVP will likely start with a single App for simplicity, using labels/metadata to denote the active persona).
- **Environment:** Secrets managed via GitHub Actions/Google Secret Manager.
