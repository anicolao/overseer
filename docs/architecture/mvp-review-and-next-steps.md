# MVP Architectural Review and Pre-V2 Remediation Design

## 1. Executive Summary
This document serves as the Product/Architect review of the current Minimum Viable Product (MVP) implementation of the Overseer system. While the MVP successfully proves the core concept of GitHub-issue-driven multi-agent orchestration, the current architectural foundation requires stabilization and refactoring before we can safely introduce V2 components (such as the State Manager and Context Compactor).

## 2. Architectural Suitability Assessment
The MVP establishes a functional baseline but exhibits several architectural shortcuts typical of rapid prototyping:

*   **Coupling:** The orchestrator logic is tightly coupled with the GitHub API client and LLM service calls. This makes unit testing difficult and violates the Single Responsibility Principle.
*   **Context Handling:** Currently, issue context and conversation history are passed naively. As issue threads grow, this will exceed context windows, necessitating the V2 Context Compactor. However, the *interfaces* for passing this context are not well-defined, making the future compactor integration risky.
*   **Prompt Management:** Prompts and agent personas are hardcoded within the execution logic rather than being abstracted into a manageable configuration or template system.
*   **State Management:** Execution state is implicitly tied to the GitHub issue state. We lack an internal, resilient state machine to handle intermittent API failures or LLM timeouts.

## 3. Alignment with Initial Requirements
*   **Requirement: Multi-Agent Interaction via GitHub** - *Met.* Agents can read and respond to mentions.
*   **Requirement: Automated Task Execution** - *Partially Met.* The execution pipeline exists, but lacks standardized error handling and retry mechanisms.
*   **Requirement: Extensibility** - *At Risk.* The current monolithic script structure prevents easy addition of new agent personas without modifying core logic.

## 4. High-Level Technical Design for Remediation (Next Steps)
Before V2 execution, the following structural refactoring must be completed. These serve as the requirements for the remediation PRs:

### 4.1. Interface Segregation & Dependency Injection
*   **Requirement:** Abstract external dependencies (GitHub API, LLM Provider) behind clear interfaces.
*   **Design:**
    *   Create an `IGitHubProvider` interface (`fetchIssue`, `postComment`, `createPR`).
    *   Create an `ILLMProvider` interface (`generateResponse`).
    *   Refactor the main Overseer loop to accept these interfaces via dependency injection, enabling the use of mock providers in tests.

### 4.2. Prompt and Persona Externalization
*   **Requirement:** Decouple prompt definitions from application code.
*   **Design:**
    *   Implement a `PromptRegistry` class.
    *   Move all system instructions (Architect, Planner, Developer, Quality) into separate Markdown or JSON configuration files.
    *   The orchestrator will query the `PromptRegistry` based on the targeted agent persona.

### 4.3. Standardized Event Payload
*   **Requirement:** Standardize the data structure passed between the GitHub webhook/polling layer and the agent processing logic.
*   **Design:**
    *   Define an `AgentTask` domain object containing: `issueId`, `triggeringComment`, `author`, `mentionedRole`, and `historicalContext` (array of previous comments).
    *   This object will serve as the exact injection point for the V2 Context Compactor.

### 4.4. Error Boundary and Retry Wrapper
*   **Requirement:** Prevent transient API/LLM failures from crashing the Overseer process.
*   **Design:**
    *   Implement an exponential backoff retry wrapper around all calls to `ILLMProvider` and `IGitHubProvider`.
    *   Add a centralized logging module to capture standard output, warnings, and error stacks.