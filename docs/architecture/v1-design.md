# V1 Architecture & Requirements: State Machine & Context Management

## 1. Vision and Context
The current MVP implementation successfully proves the viability of the Overseer project using a reactive, regex-based event model. However, to scale and ensure resilience, the system must evolve into a structured, predictable V1 architecture. This document outlines the requirements and high-level design for transitioning to an explicit state machine and implementing robust context and artifact management.

## 2. User Requirements
*   **Predictable Workflows:** The system must transition through predefined phases deterministically (e.g., Intake, Planning, Design, Implementation, QA, Review).
*   **Context Retention:** The system must seamlessly retain and pass context (prompts, previous decisions, active file states) across different states and agent handoffs.
*   **Reliable Artifact Handling:** The system must explicitly track, validate, and manage changes to files/artifacts rather than relying on transient outputs.
*   **Error Recovery:** The system must be able to halt, rollback, or retry specific states if an agent fails or provides invalid outputs.

## 3. High-Level Technical Design

### 3.1 Explicit State Machine (FSM)
Replace the current regex-based event listening and routing with a formalized Finite State Machine.
*   **Components:** 
    *   `State Engine`: Manages the current status of an issue/task (e.g., `AWAITING_DESIGN`, `IN_DEVELOPMENT`, `QUALITY_REVIEW`).
    *   `Transitions`: Strictly defined functions that move the system from one state to another based on triggers (e.g., `PR_OPENED`, `QA_APPROVED`).
*   **Benefits:** Prevents infinite loops, race conditions, and unstructured bot interactions by ensuring only valid agents are invoked at valid times.

### 3.2 Context Manager
Introduce a centralized session/context layer for active tasks.
*   **Structure:** A unified JSON-serializable object passed to agents.
*   **Data Stored:** 
    *   Issue ID and original description.
    *   Summary of agent decisions (Architecture docs, Test plans).
    *   Current Phase.
    *   Relevant file paths.
*   **Implementation:** Persisted via temporary files or a lightweight key-value store (e.g., SQLite or Redis depending on deployment scope, but JSON files for V1 MVP are acceptable).

### 3.3 Artifact Manager
A dedicated service for interacting with the codebase.
*   **Capabilities:** Safe read/write operations, abstracting GitHub API calls (PR creation, diff generation, committing).
*   **Validation:** Ensures code changes are syntactically valid before transitioning state. 

## 4. Next Steps for Implementation
1.  Implement the `StateEngine` core class.
2.  Define the `Context` interface and storage mechanism.
3.  Refactor existing MVP agents (Architect, Quality, Planner) to conform to the new `StateEngine` triggers rather than raw regex listeners.