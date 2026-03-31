# Overseer: Phase 1 Architectural Evolution

## 1. Executive Summary
The MVP implementation of the Overseer project successfully demonstrated core functionality but accrued technical debt via synchronous processing, hard-coupled LLM dependencies, and a lack of state persistence. This document outlines the Phase 1 architecture designed to resolve these bottlenecks, transforming the system into a resilient, production-ready platform.

## 2. Core Requirements

### 2.1. LLM Gateway
*   **REQ-LLM-01 [Abstraction]:** The system must route all LLM inferences through a centralized Gateway interface, completely decoupling agent business logic from specific LLM provider APIs (e.g., OpenAI, Anthropic).
*   **REQ-LLM-02 [Resilience]:** The Gateway must implement standard resilience patterns including exponential backoff retries, rate-limit handling (HTTP 429), and request timeouts.
*   **REQ-LLM-03 [Fallback]:** The Gateway should support fallback routing to alternative models or providers if the primary LLM is degraded or unresponsive.

### 2.2. Event Bus (Asynchronous Orchestration)
*   **REQ-EVT-01 [Decoupling]:** Communication between the core Overseer API and worker agents must be asynchronous to prevent long-polling timeouts.
*   **REQ-EVT-02 [Topic Routing]:** The system must support publish/subscribe (PubSub) messaging with distinct topics/queues for different event types (e.g., `task.created`, `task.processing`, `llm.request`, `llm.response`, `task.completed`).
*   **REQ-EVT-03 [Delivery Guarantees]:** The Event Bus must ensure "at-least-once" delivery for critical state-changing events.

### 2.3. State Persistence
*   **REQ-DB-01 [Task State]:** The system must persist the full lifecycle of a task (Pending, In-Progress, Blocked, Completed, Failed).
*   **REQ-DB-02 [Audit Trail]:** All interactions between agents, the LLM Gateway, and external systems must be logged chronologically linked to a `task_id`.
*   **REQ-DB-03 [Crash Recovery]:** Upon a system restart, agents must be able to hydrate their state from the database and resume incomplete tasks.

## 3. High-Level Technical Design

### 3.1. Component Architecture
We will introduce three new logical layers to the existing system:

1.  **API & Webhook Layer:** Receives incoming client requests, creates a Database record for the Task, and publishes a `task.created` event to the Event Bus.
2.  **Event Broker (e.g., Redis PubSub or RabbitMQ):** Acts as the central nervous system. 
3.  **LLM Gateway Service:** A microservice or isolated module responsible solely for formatting provider-specific payloads, managing API keys, and handling network volatility.
4.  **Database (e.g., PostgreSQL):** The single source of truth for all system state.

### 3.2. Data Models (Schema Overview)

**Table: `tasks`**
*   `id` (UUID, Primary Key)
*   `description` (Text)
*   `status` (Enum: PENDING, RUNNING, COMPLETED, FAILED)
*   `created_at` (Timestamp)
*   `updated_at` (Timestamp)

**Table: `agent_logs`**
*   `id` (UUID, Primary Key)
*   `task_id` (UUID, Foreign Key -> tasks.id)
*   `agent_role` (String)
*   `action_type` (String)
*   `payload` (JSONB)
*   `timestamp` (Timestamp)

### 3.3. Asynchronous Workflow (Happy Path)
1.  **Client** submits a task to `POST /api/tasks`.
2.  **API** writes a `PENDING` task to the DB and publishes `task.created` to the **Event Bus**.
3.  **Planner Agent** consumes `task.created`, generates an execution plan, updates the DB, and publishes `task.planned`.
4.  **Worker Agent** consumes `task.planned`. It formulates a prompt and publishes `llm.request` to the **Event Bus**.
5.  **LLM Gateway** consumes `llm.request`, makes the HTTP call to the external LLM API, handles any retries, and publishes `llm.response`.
6.  **Worker Agent** consumes `llm.response`, executes the requested action, saves the outcome to the DB, and publishes `task.completed`.

## 4. Next Steps & Technical Dependencies
To implement this design, the engineering team must:
1.  Select and provision the Database (recommendation: PostgreSQL with Prisma/SQLAlchemy ORM).
2.  Select and provision the Event Broker (recommendation: Redis for simplicity in V1, moving to RabbitMQ later if complex routing is needed).
3.  Refactor existing MVP agents to consume from and publish to the Event Broker rather than making direct synchronous method calls.