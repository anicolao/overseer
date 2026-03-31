# V2 Architecture and MVP Transition Requirements

## 1. Vision and Overview
The MVP implementation has proven the core concept of the Overseer project but currently lacks the structural rigidity required for scale, reliability, and safe LLM orchestration. This document defines the requirements and high-level technical designs necessary to transition the codebase from MVP to a production-ready V2 architecture. The core tenets are determinism, immutability, and strict boundary enforcement.

## 2. User & System Requirements
*   **System Reliability:** The system must not fail silently. All application errors must be caught, logged structurally, and routed to a deterministic recovery path.
*   **State Predictability:** The application state must be fully traceable. Any change in state must be deliberate, immutable, and easily reproducible for debugging.
*   **Data Integrity:** All external I/O, particularly prompts sent to and responses received from LLMs, must be treated as untrusted. They require strict schema validation before entering the application's core logic.
*   **Testability:** Developers must be able to test the system's core logic rapidly and offline. External dependencies (like LLMs and external APIs) must not block unit testing.
*   **Quality Assurance:** Code must meet a minimum baseline of 85% unit test coverage, enforced automatically prior to merging any code into the main branch.

## 3. High-Level Technical Design

### 3.1. Immutable State Management
*   **Pattern:** Unidirectional Data Flow / Immutable State Container.
*   **Design:** Shared mutable state is strictly prohibited. State transitions must be handled via pure functions (reducers). 
*   **Implementation:** State objects must be deeply frozen or utilize immutable data structures. When a state update is required, the system must yield a completely new state object rather than modifying the existing one.

### 3.2. Strict Type Boundaries & Sanitization Layer
*   **Pattern:** Schema-Driven Validation (e.g., Zod for TypeScript, Pydantic for Python).
*   **Design:** Establish an "Anti-Corruption Layer" around the core domain. 
*   **Implementation:** Define exact data schemas for all LLM interactions. When the LLM responds, the raw output must pass through a schema parser. If parsing fails, the system must trigger a defined error flow (such as a retry with a correction prompt) instead of passing malformed data into the system.

### 3.3. Deterministic Error Handling
*   **Pattern:** Typed Error Hierarchy / Result Pattern.
*   **Design:** Eliminate `throw`/`catch` chains that swallow context. 
*   **Implementation:** Introduce a standardized set of domain errors (e.g., `LLMValidationError`, `StateTransitionError`, `ExternalTimeoutError`). Functions should preferably return a `Result<T, E>` type or explicitly throw categorized exceptions that are caught and handled by a centralized error dispatcher.

### 3.4. LLM Mocking Layer & Test Isolation
*   **Pattern:** Dependency Injection / Interface Segregation.
*   **Design:** Core logic must never instantiate the concrete LLM client directly.
*   **Implementation:** Define an `ILLMProvider` interface. Implement a `ProductionLLMClient` (calls the real API) and a `MockLLMClient` (returns deterministic, hardcoded responses). The CI environment will inject the `MockLLMClient` to ensure fast, zero-cost, highly predictable test runs that fulfill the 85% coverage mandate.

### 3.5. Observability and CI/CD Quality Gates
*   **Pattern:** Structured Logging & Automated Pipelines.
*   **Design:** Ensure absolute visibility into system operations and automate standard enforcement.
*   **Implementation:** Replace raw `console.log` or `print` statements with a structured logger outputting JSON format (including correlation IDs, timestamps, and log levels). Configure GitHub Actions (or equivalent CI) to block PR merges if static analysis fails, type boundaries are violated, or the 85% test coverage threshold is not met.