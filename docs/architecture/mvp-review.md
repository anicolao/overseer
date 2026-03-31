# Overseer MVP: Architectural Suitability Review & Next Steps

## 1. Executive Summary
This document serves as the formal architectural review of the Overseer Minimum Viable Product (MVP). The MVP successfully demonstrates the core vision: a multi-agent AI system (Planner, Architect, Developer, Tester, Quality, Overseer) collaborating autonomously via asynchronous communication (GitHub Issues/Comments). However, to transition from an MVP to a robust, scalable system, several structural evolutions are required.

## 2. MVP Architectural Suitability & Structural Integrity
The current MVP architecture relies on an event-driven, reactive model where agents respond to text-based triggers in issue comments. 

### Strengths
* **Decoupled Roles:** The separation of concerns (Architect focusing on design, Developer on code, etc.) is well-defined and aligns with best practices for multi-agent systems.
* **Asynchronous Collaboration:** Hooking into an issue-tracking system provides a natural, auditable paper trail for agent decisions.
* **Viability:** The core feedback loop (Plan -> Design -> Code -> Test -> Review -> Merge) is functionally proven.

### Areas for Improvement (Structural Risks)
* **Brittle Text Parsing:** The MVP relies heavily on regex and string matching (e.g., `[FILE:...]`) to extract artifacts from agent outputs. This is highly susceptible to prompt drift and formatting errors.
* **Context Window Degradation:** As issue threads grow, injecting the entire issue history into the LLM context leads to token exhaustion and instruction dilution. The MVP lacks a formal context summarization strategy.
* **Implicit State Management:** The system state (e.g., "In Design", "In Testing") is currently inferred from comment history rather than explicitly managed, leading to potential race conditions or agent confusion.

## 3. Next Steps: V1 User Requirements & High-Level Design

To remedy the structural risks identified in the MVP, the following architectural upgrades are proposed for the next iteration (V1).

### 3.1 User Requirements
1. **Explicit State Transitions:** The system must strictly enforce the lifecycle state machine (e.g., Developer cannot code until Architect provides the `[FILE:...]` design artifact).
2. **Robust Artifact Extraction:** Artifacts (code, docs) must be parsed using robust AST or structured JSON schemas rather than raw markdown regex where possible, or with fallback error-correction loops.
3. **Context Management:** The system must implement a "memory" or summarization layer to condense long issue threads before passing them to the agent prompt.
4. **Self-Healing / Retry Logic:** If an agent outputs malformed markdown, the system must automatically feed the error back to the agent for self-correction without human intervention.

### 3.2 High-Level Technical Design

**A. Central Orchestrator & State Machine**
* Introduce a lightweight State Machine (e.g., using XState or a custom state pattern) within the GitHub Action / server runner.
* **States:** `AWAITING_PLANNING`, `AWAITING_DESIGN`, `AWAITING_IMPLEMENTATION`, `AWAITING_TESTS`, `AWAITING_QA`, `READY_FOR_OVERSEER`.
* **Guard Clauses:** An agent's action will only be executed if the system is in the corresponding state, preventing out-of-turn hallucinations.

**B. Context Management Module**
* Implement a `ContextBuilder` utility.
* **Design:** When an issue comment triggers an agent, the `ContextBuilder` fetches the last $N$ comments. If token count exceeds threshold $T$, it uses a lightweight model to summarize older comments while retaining the immediate preceding instructions and artifacts verbatim.

**C. Structured Output Enforcement**
* Upgrade the prompt instructions to utilize function calling (Tool Use) or strict JSON mode where supported by the underlying LLM, reducing the reliance on raw text parsing for file definitions.
* When markdown is necessary (as with the current `[FILE:...]` standard), implement a validation pre-processor that catches unclosed tags before committing to the repository.

## 4. Conclusion
The MVP architecture is highly suitable as a proof-of-concept and successfully validates the Overseer multi-agent vision. Moving forward, the focus must shift from "getting it to work" to "making it resilient" by implementing explicit state management, robust artifact parsing, and context optimization.