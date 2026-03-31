# Overseer V2 Requirements & High-Level Design

## 1. Vision & Executive Summary
The transition from the MVP to the V2 architecture aims to transform the Overseer SDLC system from a functional prototype into a robust, scalable, and fault-tolerant agentic workflow system. The MVP proved the feasibility of autonomous agents collaborating on software tasks. V2 focuses on enterprise-grade reliability: ensuring agents do not lose their train of thought (Context Compactor), workflows survive interruptions (Agent State Manager), and the system gracefully handles upstream API outages (Circuit Breaker).

## 2. User Requirements (Product Definitions)

### 2.1 Epic: Robust SDLC Workflow Management
*   **User Story**: As an Overseer, I want the system to remember the current state of a development task so that if the system restarts or pauses, agents can resume exactly where they left off.
*   **Requirements**:
    *   The system must track distinct SDLC states (e.g., `REQUIREMENTS_GATHERING`, `PLANNING`, `DEVELOPMENT`, `TESTING`, `REVIEW`, `DONE`).
    *   The current state, agent assignments, and progress must be persisted to disk/database.
    *   Invalid state transitions (e.g., jumping from `PLANNING` to `DONE` without `DEVELOPMENT`) must be prevented or flagged.

### 2.2 Epic: Infinite Agent Memory (Context Compaction)
*   **User Story**: As an Agent, I want to process large codebases and long conversation threads without hitting LLM token limit errors, while still retaining the critical context of the issue.
*   **Requirements**:
    *   The system must proactively monitor the token count of the payload before making any LLM request.
    *   When the token count reaches 80% of the maximum context window, the system must automatically compact the history.
    *   Compaction must retain the System Prompt, the original Issue Description, and the most recent N messages, while summarizing the middle historical conversation.

### 2.3 Epic: System Resilience and Fault Tolerance
*   **User Story**: As a User, I want the system to gracefully retry operations if the LLM provider or GitHub API is temporarily down or rate-limiting, rather than crashing the entire process.
*   **Requirements**:
    *   All external network calls (LLM generation, GitHub API requests) must be routed through a resilience layer.
    *   The system must implement exponential backoff for HTTP 429 (Rate Limit) and HTTP 5xx (Server Error) responses.
    *   If an API remains unresponsive, the system must "fail gracefully", alerting the Overseer and pausing the state rather than terminating the process completely.

---

## 3. High-Level Technical Design (Architecture)

### 3.1 Agent State Manager
**Design Pattern**: Finite State Machine (FSM) + Data Access Object (DAO) for persistence.
*   **Component `StateManager`**:
    *   Maintains an in-memory representation of the active workflow.
    *   Exposes methods: `transition_to(new_state)`, `get_current_state()`, `save_state()`, `load_state()`.
*   **Persistence**:
    *   Use a local SQLite database or structured JSON files stored in a `.overseer/state/` directory.
    *   State schema: `workflow_id`, `current_state`, `active_agent`, `timestamp`, `context_snapshot_id`.
*   **State Machine Rules**:
    *   Define a strict directed graph of allowed transitions. If a transition is denied, the manager raises an `InvalidTransitionError` which forces the current agent to re-evaluate.

### 3.2 Context Compactor
**Design Pattern**: Middleware / Interceptor pattern on the LLM client.
*   **Component `TokenTracker`**:
    *   Uses a tokenizer (e.g., `tiktoken` for OpenAI models) to count tokens of the active prompt construct.
*   **Component `CompactionEngine`**:
    *   Triggered when `current_tokens > threshold`.
    *   **Strategy**: "Sliding Window with Summary".
        *   *Pin*: Messages index 0 (System) and 1 (Task definition).
        *   *Pin*: Last 3-5 messages (immediate context).
        *   *Compact*: Everything in between is sent to a faster/cheaper LLM (e.g., GPT-3.5/Claude Haiku) to generate a concise summary of past actions and decisions.
        *   *Replace*: The summarized text replaces the middle messages in the message array.

### 3.3 Circuit Breaker
**Design Pattern**: Standard Circuit Breaker + Decorator.
*   **Component `CircuitBreakerWrapper`**:
    *   Implemented as a decorator/wrapper around the base API client methods (e.g., `@with_circuit_breaker`).
    *   **States**:
        *   `CLOSED`: Requests flow normally.
        *   `OPEN`: Requests are blocked immediately, returning a cached response or raising a `CircuitOpenException` to pause the workflow.
        *   `HALF_OPEN`: Allows a single test request through to check if the downstream service has recovered.
    *   **Retry Logic**: Implements the `tenacity` library (or equivalent) to provide exponential backoff (`wait_exponential`) and jitter for transient errors before opening the circuit.

## 4. Quality & Non-Functional Constraints
*   **Testability**: The State Manager, Context Compactor, and Circuit Breaker must be 100% unit-testable using mocks (e.g., mocking `tiktoken`, mocking HTTP 429 responses).
*   **Observability**: Every state transition, context compaction event, and circuit breaker trip must be logged using structured logging (JSON) with a severity level of INFO or WARNING.
*   **Performance**: The Context Compactor token counting must operate in < 50ms to avoid slowing down agent loops.