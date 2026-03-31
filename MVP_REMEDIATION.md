# MVP Remediation: Sequential Persona Token

Testing has shown that decentralized agent triggers lead to combinatorial explosions. This remediation plan implements a **Token-based Sequential Execution** model enforced by the Dispatcher and GitHub Issue Labels.

## 1. The Token Model

### A. The "active-persona" Label
- A single GitHub Issue Label (e.g., `active-persona:overseer`) acts as the execution token.
- **Enforcement:** The Dispatcher **must** ignore any bot-triggered event if the mentioned persona does not match the current `active-persona` label.
- **Harmless Mentions:** Agents may mention each other in their text for context, but these mentions will not trigger workflows unless the mentioned agent holds the token.

### B. Hardcoded Return to Hub
- **Specialized Agents:** (Architect, Planner, Developer, Quality) are hardcoded to return the token to the **Overseer** as their final action. 
- **Mechanism:** After an agent finishes its logic and posts its comment, the Dispatcher automatically updates the issue label to `active-persona:overseer`.

### C. Overseer as the Dynamic Router
- The **Overseer** is the only persona capable of dynamic delegation.
- **Explicit Delegation Suffix:** The Overseer is instructed to end every output with the exact phrase: `Next step: @persona to take action`.
- **Mechanism:** The Dispatcher parses this suffix to identify the next token holder.
    - If the Overseer specifies `@planner`, the Dispatcher sets the label to `active-persona:planner`.
    - If no agent is specified (e.g., waiting for human), the Dispatcher removes the `active-persona` label.

## 2. Technical Implementation Plan

### 1. Dispatcher Logic (The Router)
- **Token Verification:** Check `active-persona` label before execution.
- **Sequential Flow:** 
    - If current active is an agent (not Overseer): Execute agent -> Set active to `overseer`.
    - If current active is Overseer: Execute Overseer -> Parse suffix -> Set active to mentioned persona (or none).
- **Human Override:** If a human mentions a bot, the Dispatcher grants that bot the token automatically.

### 2. Centralized Safety Limits
- Only the **Overseer** persona tracks the comment limit. Since the token always returns to the Overseer, it acts as the master circuit breaker.

### 3. GitHub Service Enhancements
- Implement `setActivePersona(owner, repo, issueNumber, persona)` to atomically manage the `active-persona:*` labels.

## 3. Success Criteria
- Parallel workflow runs per issue are eliminated.
- The system follows a deterministic `Overseer -> Agent -> Overseer` path.
- Quiescence is achieved automatically when the Overseer hands off to a human.
