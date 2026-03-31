# Overseer V2: MVP Review and Architecture Design

## 1. MVP Review and Suitability Analysis
The current MVP successfully demonstrates the core loop of the Overseer concept—coordinating AI personas to accomplish specific repository management tasks. It proves the viability of the agent-based orchestration model. 

**Suitability for Production:** **NOT SUITABLE (yet)**
While functional as a proof-of-concept, the MVP baseline exhibits several architectural limitations that must be addressed before it can be considered production-ready or capable of handling complex, long-running issues:
*   **State Volatility:** The current implementation relies heavily on volatile in-memory state. If the process crashes, all context and progress are lost.
*   **Context Window Exhaustion:** As tasks grow in complexity, the conversation history grows linearly. There is currently no mechanism to prevent the context window from exceeding the LLM's maximum token limit.
*   **API Fragility:** Direct, unmanaged calls to the LLM and GitHub APIs are brittle. Rate limits, network timeouts, or transient API errors will currently crash the system.

**Next Steps:** We must transition to a V2 architecture focused on stability, state management, and fault tolerance before adding new functional features.

---

## 2. V2 User Requirements

To address the MVP's limitations, the following core capabilities (Epics) are required:

### Epic 1: Agent State Manager
*   **REQ-1.1:** The system must persist the current state of the orchestrator and all active sub-agents to disk (or a database) after every state transition.
*   **REQ-1.2:** The system must be able to resume operations from the last known good state in the event of a fatal crash or restart.

### Epic 2: Context Compactor
*   **REQ-2.1:** The system must monitor the token count of the current context window for every agent.
*   **REQ-2.2:** When the context window approaches 80% of the maximum allowed tokens, the system must automatically summarize or truncate older context while preserving the system prompt and the most recent N interactions.

### Epic 3: Circuit Breaker
*   **REQ-3.1:** All external API calls (LLM providers, GitHub API) must be routed through a fault-tolerant wrapper.
*   **REQ-3.2:** The system must gracefully handle HTTP 429 (Rate Limit) and 5xx (Server Error) responses with exponential backoff and retry mechanisms.

---

## 3. High-Level Technical Design

### 3.1 Finite State Machine (FSM) for State Management
*   **Concept:** Implement a strict FSM for the Overseer and worker agents. Valid states include `IDLE`, `PLANNING`, `EXECUTING`, `WAITING_FOR_REVIEW`, and `COMPLETED`.
*   **Persistence:** State transitions will emit events that are appended to a local SQLite database or a write-ahead JSON-lines log (`agent_state.log`). 
*   **Hydration:** On startup, the system will read the log, replay the events, and reconstruct the FSMs to their exact previous state.

### 3.2 Sliding Window Compactor
*   **Algorithm:** Implement a sliding window context manager. The conversation history array will be partitioned into: `[System Prompt] + [Summarized History] + [Recent Active Window]`.
*   **Trigger:** A middleware token counter (using `tiktoken` or equivalent) will run before every LLM API invocation. If `total_tokens > MAX_TOKENS * 0.8`, the oldest messages in the `Recent Active Window` are extracted, sent to a cheaper/faster LLM model for summarization, and appended to the `Summarized History`.

### 3.3 API Circuit Breaker Pattern
*   **Pattern:** Implement a standard software Circuit Breaker (States: `CLOSED`, `OPEN`, `HALF-OPEN`).
*   **Behavior:** 
    *   Normal operation (`CLOSED`). 
    *   If failures cross a threshold (e.g., 3 consecutive timeouts), the circuit opens (`OPEN`), immediately failing fast without making network requests, and entering a sleep/backoff phase.
    *   After the backoff, it enters `HALF-OPEN` to test the API with a single request. If successful, it closes again.

---

## 4. Non-Functional Constraints & Quality Standards
To ensure this implementation meets our enterprise-grade goals, the following constraints must be enforced during development:
1.  **Testability:** 100% of the State Manager, Compactor, and Circuit Breaker logic must be unit-testable using dependency injection and mock API bounds. No live API calls during unit tests.
2.  **Observability:** Implement structured JSON logging (`info`, `warn`, `error`, `debug`) for all state transitions and circuit breaker events to allow for seamless debugging.
3.  **Performance:** The token counting and FSM state transition mechanisms must execute in `<50ms` to avoid adding latency to the agent loop.