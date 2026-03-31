# MVP Remediation: Architecture & Design Requirements

## 1. Overview
The current MVP implementation proved the core concept but suffers from tight coupling, synchronous execution bottlenecks, and hardcoded external dependencies. To transition to a production-ready state, we are introducing two core architectural components: an **LLM Gateway** and an **Event Bus**.

---

## 2. LLM Gateway

### 2.1 User & System Requirements
* **Abstract external dependencies:** The system must not have hardcoded references to specific LLM providers (e.g., OpenAI, Anthropic) within its core business or agent logic.
* **Resiliency & Fault Tolerance:** The gateway must handle API rate limits, transient network errors, and service unavailability using retries with exponential backoff and circuit breaker patterns.
* **Observability:** Centralized logging of all LLM requests, responses, latencies, and token usage for performance monitoring and cost tracking.
* **Extensibility:** Easily allow the addition of new LLM providers without altering core agent logic.

### 2.2 High-Level Technical Design
* **Pattern:** Interface-driven Strategy Pattern / Gateway Pattern.
* **Core Interfaces:**
  * `ILLMGateway`: Exposes generic methods like `generate_text(prompt, model_params)` and `extract_structured_data(prompt, schema)`.
  * `ILLMProvider`: Internal interface implemented by specific provider adapters (e.g., `OpenAIAdapter`, `AnthropicAdapter`).
* **Components:**
  * **Router:** Determines which underlying `ILLMProvider` to use based on requested model capabilities or fallbacks.
  * **Middleware/Interceptor Chain:** Handles cross-cutting concerns (logging, token counting, retry logic).
* **Data Contracts:**
  * `LLMRequest`: Standardized schema containing the prompt, system instructions, temperature, and max tokens.
  * `LLMResponse`: Standardized schema containing the generated text, token usage metadata, and finish reason.

---

## 3. Event Bus

### 3.1 User & System Requirements
* **Decoupling:** Agents and core system components must communicate asynchronously without holding direct references to one another.
* **Scalability:** System must support concurrent execution of tasks without blocking the main thread or web server processes.
* **State Awareness:** The system must reliably broadcast state changes (e.g., Task Created, Agent Assigned, Task Completed) so that independent services (like state persistence and UI updaters) can react.

### 3.2 High-Level Technical Design
* **Pattern:** Publish-Subscribe (Pub/Sub) / Event-Driven Architecture.
* **Core Interfaces:**
  * `IEventBus`: Exposes `publish(event_topic, payload)` and `subscribe(event_topic, handler)`.
* **Implementation Strategy:**
  * **Phase 1 (Immediate Remediation):** An Async In-Memory Event Bus (e.g., using Python's `asyncio.Queue` or Node's `EventEmitter`) to immediately decouple code structures without infrastructure overhead.
  * **Phase 2 (Production Scale):** The `IEventBus` interface will be backed by a durable message broker (e.g., Redis Pub/Sub, RabbitMQ, or Kafka) to support distributed workers.
* **Standardized Event Schemas:**
  * Base Event: `eventId`, `timestamp`, `sourceComponent`, `topic`.
  * Key Topics: `system.task.created`, `system.task.completed`, `agent.status.updated`, `error.unhandled`.
* **Idempotency:** Subscribers must be designed to be idempotent to handle potential duplicate event deliveries gracefully.

---

## 4. Integration & Next Steps
1. **Dependency Injection:** Update the application container to inject the `ILLMGateway` and `IEventBus` into existing agents.
2. **Refactoring:** Strip out direct REST calls to OpenAI from agent classes and replace them with `gateway.generate(...)`.
3. **Async Processing:** Refactor the main controller to `publish` a task rather than synchronously awaiting the agent's full execution loop.