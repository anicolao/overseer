# Overseer Project: MVP Review & V2 Architecture Design

## 1. MVP Suitability Analysis
The current MVP implementation successfully proves the core orchestration concept: distinct agents can collaborate, pass messages, and complete multi-step workflows. However, it is **not suitable for production** in its current state due to three critical structural limitations:
1. **State Volatility:** The system lacks persistent memory. Agent states and conversation histories are lost between execution runs, preventing long-running or asynchronous tasks.
2. **Context Exhaustion:** The current context management appends messages indefinitely. This guarantees context window exhaustion (token limits) during extended workflows, leading to API rejections or degraded LLM performance.
3. **API Fragility:** Direct, unmanaged calls to LLM endpoints make the system vulnerable to transient network errors, rate limits (HTTP 429), and service downtimes.

**Next Steps:** To reach production readiness, we must implement a robust V2 architecture that remedies these issues through State Management, Context Compaction, and API Resilience (Circuit Breaking).

---

## 2. V2 Product Requirements

### Epic 1: Agent State Manager
* **Req 1.1:** The system must persist the state of all active agents, including tasks, internal variables, and metadata.
* **Req 1.2:** State must be recoverable across process restarts.
* **Req 1.3:** The persistence layer should be lightweight (e.g., SQLite or local JSON storage) for V2, with abstract interfaces to allow future migration to cloud databases.

### Epic 2: Context Compactor
* **Req 2.1:** The system must monitor the token count of the active context window for each agent.
* **Req 2.2:** Upon reaching a predefined threshold (e.g., 80% of the model's limit), the system must trigger a compaction routine.
* **Req 2.3:** Compaction should preserve system instructions and recent messages, while summarizing older conversational history into a dense "memory block".

### Epic 3: Circuit Breaker & Retry Resilience
* **Req 3.1:** All external LLM API calls must be wrapped in a resilience layer.
* **Req 3.2:** The system must implement exponential backoff for transient errors (e.g., 429 Rate Limit, 503 Service Unavailable).
* **Req 3.3:** A circuit breaker must trip after a configurable number of consecutive failures, halting execution gracefully rather than crash-looping.

---

## 3. High-Level Technical Design

### 3.1 Architecture Components
* **`StateManager` Class:** 
  * Exposes `save_state(agent_id, state_dict)` and `load_state(agent_id)`.
  * Utilizes an adapter pattern (`StorageAdapter`) to allow switching between `FileStorageAdapter` and `SQLiteStorageAdapter`.
* **`ContextCompactor` Module:**
  * Implements a middleware pattern that intercepts messages before they hit the LLM.
  * Uses a fast, local tokenizer (e.g., `tiktoken`) to estimate context size.
  * If threshold exceeded, dispatches a background LLM call using a `summarization_prompt` to condense history.
* **`ResilienceLayer` Decorators:**
  * Introduces `@retry(backoff=exponential, max_attempts=3)` decorators on all network-bound API methods.
  * Introduces a `CircuitBreaker` class that tracks failure states (`CLOSED`, `OPEN`, `HALF_OPEN`) per external endpoint.

### 3.2 Data Models
**State Record:**
```json
{
  "agent_id": "string",
  "current_status": "idle | busy | waiting",
  "assigned_tasks": ["task_id_1"],
  "memory_summary": "string",
  "last_updated": "timestamp"
}
```

### 3.3 System Flow
1. **Init:** Agent wakes up and requests its state from `StateManager`.
2. **Execute:** Agent formulates a response. `ContextCompactor` intercepts to ensure payload is within token limits.
3. **Network:** Request passes through `ResilienceLayer`. If LLM API fails, exponential backoff retries the request. If circuit trips, agent state is saved as `waiting_on_api` and execution suspends safely.
4. **Finalize:** Response is received, internal state is updated, and `StateManager` persists the new state.