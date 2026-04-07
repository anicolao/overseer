# Copilot Integration Implementation Plan

This document outlines the step-by-step plan to integrate GitHub Copilot alongside the existing Gemini service, based on the approved design in `docs/design/copilot_integration.md`.

## Increments

### 1. Extract Strict `AiService` Interface
**Goal:** Define the abstraction layer for AI providers.
**Files to Modify:**
- `src/utils/ai_provider.ts`
- `src/utils/gemini.ts`
**Details:**
- Update `src/utils/ai_provider.ts` to define `AiService` and `AiChatSession` interfaces as strict interfaces with no optional parameters.
- The interface must match the design:
  - `promptPersona(systemInstruction: string, userMessage: string, context: string, modelName: string): Promise<string>`
  - `startChat(systemInstruction: string, history: unknown[], modelName: string): AiChatSession`
  - `AiChatSession.sendMessage(content: string | Array<unknown>): Promise<{ text: string, response: unknown }>`
- Update `src/utils/gemini.ts` to implement `AiService` and `AiChatSession` without optional parameters.

### 2. Implement `CopilotService`
**Goal:** Create the GitHub Copilot API backend implementation for `AiService`.
**Files to Create:**
- `src/utils/copilot.ts`
**Details:**
- Create `src/utils/copilot.ts` and implement the `AiService` interface in a `CopilotService` class.
- The `CopilotService` should use the `GITHUB_TOKEN` (or a dedicated `COPILOT_API_KEY`) to interact with the GitHub Copilot API.
- Use `installFetchInstrumentation`, `logTrace`, and `textStats` for parity with `GeminiService` telemetry.

### 3. Update Bot Configurations
**Goal:** Configure the AI provider and model per bot.
**Files to Modify:**
- `bots.json`
- `src/bots/bot_config.ts`
**Details:**
- Update `src/bots/bot_config.ts` to include `"copilot"` in the `LlmProvider` type and update provider parsing.
- Ensure the `llm` key (provider and model) in `bots.json` is correctly processed to configure each bot's AI backend, allowing different bots to use different providers.

### 4. Update Consumers
**Goal:** Switch the core framework to depend on the `AiService` interface instead of the concrete `GeminiService`.
**Files to Modify:**
- `src/personas/overseer.ts`
- `src/personas/task_persona.ts`
- `src/utils/agent_runner.ts`
**Details:**
- In `src/personas/overseer.ts` and `src/personas/task_persona.ts`, change the constructor signature to accept `AiService` instead of `GeminiService`. Update internal property types.
- In `src/utils/agent_runner.ts`, change the `runAutonomousLoop` function signature and logic to rely on the generic `AiService`.

### 5. Wire Provider at Startup
**Goal:** Initialize the correct AI provider based on per-bot configuration.
**Files to Modify:**
- `src/dispatch.ts`
- `src/index.ts`
**Details:**
- In `src/dispatch.ts` and `src/index.ts`, read the AI provider and model from the loaded bot configuration (`bot.llm.provider` and `bot.llm.model`) rather than an environment variable.
- Instantiate `CopilotService` or `GeminiService` based on this config and pass the abstract instance (and configured model name) to the persona constructors.
