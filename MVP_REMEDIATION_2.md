# MVP Remediation 2: Atomic State & Implicit Handoff

Attempt #3 demonstrated that a decentralized mention system creates race conditions and breaks the chain of execution. This plan refines the token model to ensure atomic transitions and empowers the Overseer to act as a truly stateful orchestrator.

## 1. Identified Issues in Attempt #3

### A. The Comment/Label Race Condition
Agents post comments *inside* their logic, triggering new workflows before the Dispatcher can update the `active-persona` label. This results in the next run failing the authorization check.

### B. Mention-Dependent Triggers
The system currently relies on explicit `@mentions` to trigger workflows. If an agent forgets to mention the Overseer, or if a persona is mentioned in a quiescent state without the token, the loop breaks or triggers incorrectly.

### C. Fragmentation of Context
Personas currently only see the latest comment or a partial issue body, leading to a loss of state over long-running tasks.

## 2. Proposed Structural Improvements

### 1. Atomic Transitions (Label-then-Comment)
Personas will no longer post to GitHub. They will return their response string to the Dispatcher.
- The Dispatcher **updates the label first** (`active-persona: next`).
- The Dispatcher **posts the comment second**.
- This ensures the persistent state in GitHub is correct before the next workflow run begins.

### 2. State-Driven Dispatching (Implicit Handoff)
The Dispatcher will use the `active-persona` label as the primary source of truth, rather than just mentions:
- **If `active-persona` is a specialized agent** (e.g., `architect`): Trigger that agent only if they are explicitly mentioned (by a human or the Overseer). After they run, the token automatically reverts to `overseer`.
- **If `active-persona` is `overseer`**: The Overseer **always** runs on every new comment, regardless of mentions. It reviews the entire issue history to decide the next step.
- **If `active-persona` is `none`**: The issue is quiescent. The Overseer only triggers if explicitly @mentioned by a human.

### 3. Full Issue Context
When the Overseer is activated, it will fetch and read the **entire issue history** (title, body, and all comments) to ensure it has the full context of previous agent outputs and human feedback before delegating.

### 4. Simplified Delegation Suffix
The Overseer will use the mandatory suffix: `Next step: @persona to take action`.
- The Dispatcher parses this to set the label.
- **Safety Rule:** If the Overseer specifies `@overseer` or fails to specify a valid persona, the Dispatcher will set the token to `none` and log a comment detailing the dispatch error. This prevents infinite self-processing loops.
- If the Overseer specifies human review, the token is cleared (`none`).

## 3. Technical Tasks

1.  **Refactor Personas:** Update all `handle*` methods to return `Promise<string>`.
2.  **Dispatcher Overhaul:**
    *   Implement the "Label-then-Comment" sequence.
    *   Implement the state machine logic:
        - `overseer` label -> Run Overseer (Full Context).
        - `agent` label -> Run Agent (if mentioned).
        - `none` label -> Run Overseer (if mentioned).
3.  **GitHub Service:** Add `getFullIssueContext(owner, repo, issueNumber)` to aggregate all text.

## 4. Success Criteria
- Reliable transitions without race conditions.
- No reliance on bots mentioning each other in text.
- The Overseer correctly pauses for human input and resumes only when prompted.
