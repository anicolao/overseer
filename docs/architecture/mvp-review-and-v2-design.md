# MVP Architecture Review & V2 Technical Design

## 1. Executive Summary & Vision Alignment
The current MVP successfully demonstrates the core "Overseer" loop: ingesting GitHub issues, delegating tasks to specialized personas (Planner, Architect, Developer, Quality), and orchestrating responses. It proves the viability of an autonomous, multi-agent software development lifecycle. However, to scale and ensure reliable, fully autonomous Pull Request generation, the architecture must evolve from a synchronous, stateless prompt-chain into an event-driven, stateful agentic framework.

## 2. MVP Architectural Assessment
* **Suitability:** The current orchestration is adequate for a proof-of-concept. It successfully routes LLM calls and applies basic persona constraints.
* **Identified Gaps:**
  * **Statelessness:** State is currently managed purely within the active context window, which is brittle and prone to token-limit exhaustion on complex issues.
  * **Synchronous Blocking:** Agent operations (especially codebase analysis and generation) block the main thread.
  * **Lack of Validation Sandbox:** The Developer agent creates code, but there is no secure, isolated environment for the Quality agent to actually execute tests before proposing changes.

## 3. Next Steps: V2 User Requirements
Based on the MVP review, the following requirements are defined for the next iteration:
* **UR-01: Stateful Context Management:** The system must persistently store conversation and codebase context across multiple webhook events (e.g., a new comment on an issue shouldn't require rebuilding the entire context from scratch).
* **UR-02: Asynchronous Agent Execution:** Agents must perform long-running operations (repository cloning, deep AST parsing) asynchronously.
* **UR-03: Autonomous Self-Correction Loop:** The Developer and Quality agents must be able to iterate in a closed loop (write code -> run test -> fail -> fix code) up to a defined threshold before escalating to the Overseer.

## 4. High-Level Technical Design (V2)

### 4.1. Event-Driven Orchestrator
Transition the core Overseer loop to a finite state machine (e.g., using LangGraph or AWS Step Functions). 
* **States:** `Triaging`, `Planning`, `Designing`, `Implementing`, `Testing`, `PR_Ready`, `Blocked`.
* **Transitions:** Triggered by specific GitHub webhook events (Issue opened, comment added) or internal agent completions.

### 4.2. Memory & RAG Layer
* Implement a local Vector Database (e.g., ChromaDB) coupled with AST (Abstract Syntax Tree) parsing.
* This allows the Architect and Developer to query specifically for affected codebase components rather than loading the entire repository into the prompt context.

### 4.3. Execution Sandbox
* Introduce a containerized environment (Docker-in-Docker or microVMs like Firecracker) specifically for the `Quality` agent.
* **Workflow:** Developer outputs code -> Orchestrator spins up Sandbox -> Quality agent injects code and runs `npm test` / `pytest` -> Sandbox returns stdout/stderr -> If fail, loop back to Developer.

## 5. Conclusion
The MVP is fit for internal testing and validation of the prompt strategy. However, before it is "production-ready" for complex repositories, the architectural gaps (Sandbox, Memory, State Machine) must be addressed.