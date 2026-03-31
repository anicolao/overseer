# V2 Architecture & Refactoring Design Specification

## 1. Executive Summary
The MVP implementation successfully validated the core agent-based workflows but is not currently suitable for production. It suffers from tight coupling between agent logic and external services, relies heavily on mutable shared state, and lacks comprehensive error boundaries. This V2 Design Specification outlines the architectural changes required to transition the codebase to a production-ready state.

## 2. Core User & System Requirements
- **Decoupling & Modularity:** Core agent logic must be fully decoupled from specific implementations of LLM providers, file systems, and version control.
- **Predictable State Management:** The system must eliminate global/mutable shared state, ensuring agent context transitions are traceable, reproducible, and thread-safe.
- **Resiliency & Recovery:** The system must degrade gracefully when external services fail, utilizing structured error boundaries and automated retry mechanisms.
- **Testability:** All components must be independently testable via Dependency Injection (DI) and interface mocking.

## 3. High-Level Technical Design

### 3.1. Dependency Injection & Interface Segregation
To solve the tight coupling identified in the MVP, we will introduce a strict interface layer.
- **`ILLMClient`**: Abstract away provider-specific implementations (e.g., OpenAI, Anthropic) to handle standard completions, embeddings, and token counting.
- **`IVFS (Virtual File System)`**: Isolate file operations to allow in-memory file systems during testing.
- **`IGitProvider`**: Abstract version control operations to decouple workflow logic from local CLI environments.

### 3.2. Immutable State Management
Currently, agents modify a shared context directly, leading to race conditions and untraceable bugs.
- **State Definition**: We will implement an immutable `AgentState` record/dataclass.
- **State Transitions**: Agents will emit `StateTransition` events rather than mutating context. A central `StateManager` or Reducer will process these events to produce the next immutable state.
- **Traceability**: All state changes must be appended to an append-only log, serving as an audit trail for debugging and human-in-the-loop review.

### 3.3. Error Boundaries & Fallbacks
Weak error boundaries in the MVP cause cascading failures.
- **Structured Return Types**: Replace unhandled exceptions with explicit `Result<T, Error>` types across all core internal APIs.
- **Retry Decorators / Policies**: Implement exponential backoff for transient errors (e.g., rate limits, network timeouts) at the boundary layer (e.g., inside the concrete implementations of `ILLMClient`).
- **Circuit Breakers**: Introduce a circuit breaker pattern for external service calls to prevent system lockup during prolonged outages.

## 4. Execution Strategy for Developer Agents
The refactoring should be executed in the following PR sequence:
1. **PR 1: Core Interfaces & DI Framework** - Define `ILLMClient`, `IVFS`, and `IGitProvider` and wire up the basic Dependency Injection container.
2. **PR 2: State Management Refactor** - Introduce the immutable `AgentState` and transition logic, migrating existing agent loops to this new pattern.
3. **PR 3: Error Boundaries & Resilience** - Implement `Result` types, retry policies, and structured logging mechanisms.
4. **PR 4: Integration & Cleanup** - Remove legacy tightly coupled code, ensuring all new unit and integration tests pass.