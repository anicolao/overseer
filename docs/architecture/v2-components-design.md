# SDLC V2 Component Requirements & Design

## 1. Overview
Following the MVP architectural review, it is clear that while the issue-driven architecture provides a solid foundation, the system lacks the necessary safeguards and state management for autonomous, scalable agent operations. This document outlines the user requirements and high-level technical designs for the three critical V2 components required to remedy these MVP gaps: the Agent State Manager, Context Compactor, and Circuit Breaker. 

## 2. Agent State Manager
### 2.1 User Requirements
*   **State Tracking:** The system must track the exact operational state of every agent (e.g., Idle, Analyzing, Implementing, Reviewing, Blocked, Completed).
*   **Auditability:** Developers and human overseers must be able to query the historical state transitions of an agent for a given issue.
*   **Concurrency Control:** Prevent multiple agents from conflicting on the same task or file simultaneously.

### 2.2 High-Level Design
*   **Architecture:** Implement a finite state machine (FSM) service. 
*   **Data Store:** Use a fast, in-memory store like Redis for real-time locks and state persistence, backed by PostgreSQL for long-term audit logs.
*   **Interface:** Expose a REST/gRPC API for agents to emit state changes (`TransitionState(agent_id, task_id, new_state)`).

## 3. Context Compactor
### 3.1 User Requirements
*   **Token Optimization:** As GitHub issue threads and PR discussions grow, the system must ensure LLM context windows are not exceeded.
*   **Information Retention:** The system must retain crucial architectural decisions and constraints while discarding redundant chatter.

### 3.2 High-Level Design
*   **Architecture:** A middleware text-processing pipeline integrated into the agent payload builder.
*   **Logic:** 
    1. Monitor token count of the impending LLM prompt.
    2. If tokens exceed 80% of the maximum window, trigger the Compactor.
    3. The Compactor uses a cheaper, faster LLM (or extractive NLP model) to summarize chronological logs older than 'N' days into a dense `SYSTEM_CONTEXT` block, replacing the raw logs.
*   **Storage:** Store compacted summaries in the database linked to the issue/PR ID to avoid re-compacting the same history.

## 4. Circuit Breaker
### 4.1 User Requirements
*   **Infinite Loop Prevention:** The system must detect and halt agents that are stuck in repetitive failure loops (e.g., repeatedly failing a build and trying the exact same fix).
*   **Cost Control:** Automatically pause operations if API error rates or token usage spikes abnormally.
*   **Human Handoff:** Alert human maintainers when a circuit is tripped.

### 4.2 High-Level Design
*   **Architecture:** An interceptor pattern on the Agent's action dispatcher.
*   **Metrics Tracked:** 
    *   Consecutive identical actions.
    *   Consecutive test/build failures (> 3).
    *   API 4xx/5xx responses from LLM providers or GitHub.
*   **Mechanism:** When thresholds are exceeded, the Circuit Breaker updates the Agent State Manager to `BLOCKED_CIRCUIT_TRIPPED`, halting execution. It then posts a high-priority comment on the GitHub issue requesting human intervention.

## 5. Next Steps
Once the Quality team finalizes their assessment of the existing MVP codebase, the Planner will use this document alongside the Quality report to generate specific PR tickets for the development team.