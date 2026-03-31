# Overseer V1 Requirements & High-Level Design

## 1. Vision and Scope
The MVP successfully demonstrates the core mechanics of GitHub webhook ingestion and basic agentic responses. However, to scale into a robust, production-ready system (V1), the architecture must evolve to handle API unreliability, maintain conversational and stateful context across asynchronous events, and provide a standardized interface for inter-agent communication and tooling. 

This document outlines the requirements and high-level design for the V1 system, organized into three phases.

## 2. Phase 1: Resilience & Observability
**Goal:** Prevent cascading failures from external API limits (e.g., OpenAI, GitHub) and provide deep visibility into system health.

### Requirements
*   **Retry Mechanisms:** All outbound API calls to LLM providers and GitHub must implement exponential backoff and retry logic.
*   **Rate Limiting Awareness:** The system must respect GitHub's rate limits and pause/queue execution when thresholds are approached.
*   **Structured Logging:** All logs must be structured (JSON format) and include a `correlation_id` tied to the triggering GitHub webhook event to trace multi-step agent workflows.
*   **Metrics:** Track execution time, token usage per agent, and error rates.

### High-Level Design
*   **`ApiClient` Wrapper:** Implement an interface/wrapper around the standard HTTP/LLM clients. Utilize libraries like `tenacity` (Python) or `bottleneck`/`async-retry` (Node.js) to manage backoffs.
*   **Logger Middleware:** Inject a unique trace ID into the execution context the moment a webhook payload is received.
*   **Telemetry:** Output metrics to a standard `/metrics` endpoint (Prometheus format) or integrate with OpenTelemetry.

## 3. Phase 2: Context Memory & State Management
**Goal:** Enable agents to maintain context across multiple comments, reviews, and code pushes on a single Issue or Pull Request.

### Requirements
*   **Persistent State:** Replace any in-memory state with a persistent, queryable datastore.
*   **Thread History:** Agents must be able to retrieve the last *N* interactions on a specific GitHub issue/PR to maintain conversational consistency.
*   **Task State Machine:** Track the state of an agent's task (e.g., `PENDING`, `IN_PROGRESS`, `AWAITING_REVIEW`, `COMPLETED`).

### High-Level Design
*   **Datastore Selection:** Introduce PostgreSQL (for relational task tracking) or Redis (for fast, ephemeral context caching).
*   **`StateStore` Module:** Create an abstraction layer for reading/writing agent context. 
*   **Data Model:** 
    *   `Session`: Tied to an Issue/PR ID.
    *   `Event`: Logs individual webhook triggers.
    *   `Task`: Maps to specific sub-goals assigned to individual agents (e.g., Planner, Architect, Quality).

## 4. Phase 3: Structured Tooling & Inter-Agent Communication
**Goal:** Standardize how agents execute actions and delegate tasks to one another.

### Requirements
*   **Standardized Tool Interface:** Agents must use an extensible registry of tools (e.g., `ReadCode`, `CreatePR`, `CommentOnIssue`) rather than ad-hoc API calls.
*   **Structured Outputs:** LLM responses must strictly adhere to JSON schemas when communicating intents or tool executions.
*   **Message Bus/Queue:** Agents must be able to securely pass context and triggers to downstream agents without tight coupling.

### High-Level Design
*   **Tool Registry:** A centralized configuration defining available tools, their JSON schemas, and execution handlers.
*   **Agent Router:** A lightweight routing mechanism (event bus or message queue like RabbitMQ or simple DB-backed queue) that listens for an agent's output and triggers the next agent.
*   **Schema Validation:** Enforce JSON schema validation (e.g., via Pydantic or Zod) on all LLM outputs before processing tool execution or passing data to another agent.