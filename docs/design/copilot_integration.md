# Copilot Integration Design

## Objective
Add support for GitHub Copilot integration (backed by GPT 5.4 or Opus 4.6) as an alternative AI service provider for the framework, operating seamlessly alongside the existing `GeminiCliService` integration and replacing the hardcoded Google Generative AI coupling.

## Action Semantics
No new framework actions are introduced. The core execution workflow remains unchanged, but the underlying prompts and completions must be routed through the Copilot API when configured, relying on an abstract interface instead of a concrete `GeminiService`.

## Affected Files and Seams

- **`src/utils/ai_provider.ts`:**
  Ensure the `AiService` interface represents the provider abstraction and takes no optional parameters (strict interface).
  ```typescript
  export interface AiChatSession {
      sendMessage(content: string | Array<unknown>): Promise<{ text: string, response: unknown }>;
  }
  export interface AiService {
      promptPersona(systemInstruction: string, userMessage: string, context: string, modelName: string): Promise<string>;
      startChat(systemInstruction: string, history: unknown[], modelName: string): AiChatSession;
  }
  ```

- **`bots.json` & `src/bots/bot_config.ts`:**
  Update the `LlmProvider` type in `src/bots/bot_config.ts` to include `"copilot"`. The configuration for the AI provider and model will be defined per bot in `bots.json` under the `llm` key so that multiple AI implementations can collaborate on the same project. Update the provider parsing in `bot_config.ts` to allow "copilot" alongside "gemini".

- **`src/utils/gemini.ts`:**
  Update the existing `GeminiService` class to explicitly implement the new strict `AiService` interface without changing its core behavior.

- **`src/utils/copilot.ts` (New File):**
  Create a new `CopilotService` class that implements `AiService`. This service will connect to the GitHub Copilot / Models API and support the configured model backend (e.g., GPT 5.4 or Opus 4.6).

- **`src/personas/overseer.ts` & `src/personas/task_persona.ts`:**
  Update the constructor signatures to accept `AiService` instead of `GeminiService`. The existing `geminiCli` dependencies remain unaffected so that the Gemini CLI integration can run alongside it.

- **`src/utils/agent_runner.ts`:**
  Update the runtime execution seam, specifically `AgentRunnerClass.runAutonomousLoop`, to depend on `AiService` rather than `GeminiService`.

- **`src/index.ts` & `src/dispatch.ts`:**
  Update the root initialization logic. Read the AI provider and model from the loaded bot configuration (via `src/bots/bot_config.ts` from `bots.json`) rather than environment variables, to instantiate either `CopilotService` or `GeminiService`, and pass that abstract instance to the persona constructors.

## Implementation Steps

1. Update `src/utils/ai_provider.ts` to define the strict `AiService` and `AiChatSession` interfaces without optional parameters.
2. Update `src/bots/bot_config.ts` to support `"copilot"` as an `LlmProvider`.
3. Modify `bots.json` to assign per-bot configurations if any bots should use Copilot defaults.
4. Refactor `src/utils/gemini.ts` to implement the updated strict `AiService`.
5. Create `src/utils/copilot.ts` and implement `CopilotService` with HTTP fetch logic to the Copilot backend.
6. Update `AgentRunner`, `OverseerPersona`, and `TaskPersona` to consume the generic `AiService`.
7. Wire the correct provider at startup in `src/dispatch.ts` and `src/index.ts` based on the loaded bot configuration.