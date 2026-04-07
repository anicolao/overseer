# Copilot Integration Implementation Plan

This document outlines the step-by-step plan to integrate GitHub Copilot alongside the existing Gemini service, based on the approved design in `docs/design/copilot_integration.md`.

## Increments

### 1. Extract `AiService` Interface
**Goal:** Define the abstraction layer for AI providers.
**Files to Modify:**
- `src/utils/ai_provider.ts` (Create)
- `src/utils/gemini.ts`
**Details:**
- Create `src/utils/ai_provider.ts` and define `AiService` and `AiChatSession` interfaces.
- The interface should match the signatures used by the framework:
  - `promptPersona(systemInstruction: string, userMessage: string, context?: string, modelName?: string): Promise<string>`
  - `startChat(systemInstruction: string, history?: unknown[], modelName?: string): AiChatSession`
  - `AiChatSession.sendMessage(content: string | Array<unknown>): Promise<{ text: string, response: unknown }>`
- Update `src/utils/gemini.ts` to implement `AiService` and `AiChatSession` (the existing `GeminiService` class and `GeminiChatSession` interface can seamlessly implement these). Ensure it is exported as an implementer.

### 2. Implement `CopilotService`
**Goal:** Create the GitHub Copilot API backend implementation for `AiService`.
**Files to Modify:**
- `src/utils/copilot.ts` (Create)
**Details:**
- Create `src/utils/copilot.ts` and implement the `AiService` interface in a `CopilotService` class.
- The `CopilotService` should use the `GITHUB_TOKEN` (or a dedicated `COPILOT_API_KEY`) to interact with the GitHub Copilot API.
- Use `installFetchInstrumentation`, `logTrace`, and `textStats` for parity with `GeminiService` telemetry.
- Support configuration of the model backend (e.g., using a constructor parameter or environment variables).

### 3. Update Consumers
**Goal:** Switch the core framework to depend on the `AiService` interface instead of the concrete `GeminiService`.
**Files to Modify:**
- `src/personas/overseer.ts`
- `src/personas/task_persona.ts`
- `src/utils/agent_runner.ts`
**Details:**
- In `src/personas/overseer.ts` and `src/personas/task_persona.ts`, change the constructor signature to accept `AiService` instead of `GeminiService`. Update internal property types.
- In `src/utils/agent_runner.ts`, change the `runAutonomousLoop` function signature and logic to rely on the generic `AiService`.

### 4. Wire Provider at Startup
**Goal:** Initialize the correct AI provider based on configuration.
**Files to Modify:**
- `src/dispatch.ts`
- `src/index.ts`
**Details:**
- In `src/dispatch.ts` and `src/index.ts`, read the `AI_PROVIDER` environment variable.
- If `AI_PROVIDER=copilot`, instantiate `CopilotService` with the appropriate token.
- If `AI_PROVIDER=gemini` (or undefined), instantiate `GeminiService` with `GEMINI_API_KEY`.
- Pass the resolved `AiService` instance to the initialization of personas.
