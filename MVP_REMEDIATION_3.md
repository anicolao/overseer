# MVP Remediation 3: Autonomous Iteration & Tighter Boundaries

Initial testing reveals that relying on the Overseer to drive every tactical step results in fragile execution and role-blurring. This plan pivots Overseer to an **Autonomous Persona Loop** model, where agents iterate internally within a single GitHub Action run to complete complex tasks.

## 1. Core Structural Changes

### A. The "Autonomous Agent" Loop
Instead of one LLM call per workflow run, each persona will implement an internal **Plan-Act-Verify** loop (similar to SWE-agent).
1.  **Input:** Task description and current repository state.
2.  **Loop:**
    - Agent generates a `[RUN]` block.
    - Dispatcher executes and returns output *to the same LLM instance*.
    - Agent analyzes output, potentially modifies files, and runs verification (tests/lint).
    - Repeat until the agent is satisfied or hits an internal limit.
3.  **Output:** A single, final PR or status update.

### B. Strict Role Enforcement
- **Overseer & Quality:** Are **forbidden** from writing implementation code or documentation directly to the repository (except for metadata labels). They act as reviewers and orchestrators only.
- **Product/Architect & Developer/Tester:** Are the only roles authorized to modify the repository filesystem.
- **Quality:** Must use the shell to `run test` or `run lint`, but can only report the results back to the Overseer.

### C. Repository-Centric Communication
- **Large Context:** Detailed reports, architectural designs, and implementation notes must be written to files in the repository (e.g., `docs/decisions/`, `reports/quality/`).
- **Concise Comments:** Agents are prompted to provide a **maximum 3-sentence summary** on the GitHub Issue, referencing the files they created or updated.
- **Execution Artifacts:** The Dispatcher will record the entire internal agent loop (all commands and outputs) and upload it as a GitHub Action Artifact, automatically posting a link in the issue for human/bot inspection.

## 2. Technical implementation Plan

### 1. The `AgentRunner` Core
Implement a shared utility that manages the internal LLM loop:
- Maintains a local "conversation history" of shell outputs.
- Parses `[RUN]` blocks and executes them in real-time.
- Implements a "Stop Condition" (task complete or error).

### 2. Dispatcher Refactoring
- The Dispatcher moves from being a "Router" to a "Host."
- It prepares the VM, hands the token to the `AgentRunner`, and manages the post-execution artifact upload and summary posting.

### 3. Artifact Integration
- Use `@actions/artifact` to upload the session log.
- Generate a stable URL to the artifact and append it to the agent's concise comment.

## 3. Success Criteria
- Agents resolve complex, multi-step issues (like fixing lint errors across 5 files) in a single workflow run.
- Issue threads remain clean and readable.
- Role boundaries are respected (no Overseer-generated PRs).
- Full transparency is maintained via execution logs.
