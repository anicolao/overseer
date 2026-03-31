# MVP Design: Overseer Self-Bootstrapping

The goal of the Overseer MVP is to reach a state of "self-hosting" as quickly as possible. This means Overseer should be able to manage its own development tasks, design its own features, and implement them through its own persona-based workflow.

## Core Objective
Implement a functional "loop" where a human can provide a high-level goal for the Overseer project itself, and the system can autonomously drive that goal to a Pull Request through its internal personas.

## Minimum Necessary Infrastructure

1. **The Overseer Hub:**
   - A single backend service (Node.js/FastAPI) to receive GitHub webhooks.
   - Support for multiple GitHub App identities (one for each persona).
   - Integration with Gemini (Multimodal & Live API for the Overseer persona).

2. **GitHub Project v2 Configuration:**
   - A project board to aggregate issues and PRs.
   - Custom fields for `Persona`, `Phase` (Requirements, Design, Plan, Execution, Quality), and `Actionable` (Yes/No).

3. **Core Persona Logic (MVP):**
   - **Overseer:** Orchestrator, reviews output from Product, Architect, and Planner.
   - **Product:** Translates vision into requirements.
   - **Architect:** Designs technical changes.
   - **Planning:** Breaks down designs into specific, bite-sized issues.
   - **Developer:** Implements changes and creates PRs.
   - **Quality:** Verifies the work of the Developer and Tester (MVP can combine Tester/Quality).

## MVP Workflow: The "Self-Dev" Loop

1. **Vision:** A human creates an issue in the Overseer repo with a vision for an Overseer feature.
2. **Product Phase:** Overseer mentions **Product** to define requirements. Overseer reviews and approves.
3. **Design Phase:** Overseer mentions **Architect** for high-level design.
4. **Planning Phase:** Overseer mentions **Planner** to break the design into actionable tasks.
5. **Alignment:** Overseer, Architect, and Planner iterate (via Issue comments) until the plan is marked `Actionable: Yes`.
6. **Execution:** Planner mentions **Developer** to implement the first task. Developer opens a PR.
7. **Quality:** Planner mentions **Quality** to review the PR. Once approved, it is ready for human merge.

## Success Metrics for MVP

- The Overseer system successfully implements one minor feature or fix for itself (e.g., adding a new label or updating a prompt).
- The "Vision -> Product -> Design -> Plan -> Execute" flow completes with only high-level human approval.
- A human can discuss the current state with the Overseer persona via the Gemini Live API.

## Technical Stack Selection

- **Backend:** Node.js/TypeScript (using Octokit for GitHub interaction).
- **AI:** Gemini 1.5 Pro (Multimodal) and Gemini Live API.
- **Hosting:** Vercel/Cloudflare Workers (for webhook handling) or a long-running instance for the Live API bridge.
- **Identity:** GitHub App per persona.
