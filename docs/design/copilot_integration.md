# Copilot Integration Design

## Objective
Add support for GitHub Copilot integration (backed by GPT 5.4 or Opus 4.6) as an alternative AI service provider for the framework, operating seamlessly alongside the existing `GeminiCliService` integration and replacing the hardcoded Google Generative AI coupling. In addition, address framework technical debt by removing duplicated persona code, eliminating hardcoded model fallbacks, and cleaning up unused patches.

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
  Update the `OverseerPersona` (in `src/personas/overseer.ts`) and `TaskPersona` constructor signatures to accept `AiService` instead of `GeminiService`. The existing `geminiCli` dependencies remain unaffected so that the Gemini CLI integration can run alongside it.

- **`src/utils/agent_runner.ts`:**
  Update the runtime execution seam, specifically `AgentRunner.runAutonomousLoop`, to depend on `AiService` rather than `GeminiService`.
  **Crucially:** Remove the `options.modelName || "gemini-3.1-pro-preview"` fallback around line 119 and in `logTrace`. The runner must rely entirely on `options.modelName` or the configured bot provider details, without silently falling back to a hardcoded gemini model name.

- **`src/index.ts`, `src/dispatch.ts`, & `src/bots/personas.ts` (New File or Utility):**
  Update the root initialization logic to instantiate `CopilotService` or `GeminiService` based on `bots.json` instead of environment variables.
  **API Key Source:** Clarify that `COPILOT_API_KEY` should be sourced from `process.env.COPILOT_API_KEY`, falling back to `process.env.GITHUB_TOKEN` to authenticate the GitHub Copilot API.
  **Deduplication:** Deduplicate the shared persona creation code (the `personas` object instantiation with `OverseerPersona` and `TaskPersona`) by extracting it into a common initialization module or utility shared by both `index.ts` and `dispatch.ts`.

- **Project Root (Cruft Removal):**
  Delete temporary patch scripts and cruft files from the root repository, specifically: `fix_test.cjs`, `patch_dispatch.cjs`, and `patch_index.cjs`.

## Implementation Steps

1. Update `src/utils/ai_provider.ts` to define the strict `AiService` and `AiChatSession` interfaces without optional parameters.
2. Update `src/bots/bot_config.ts` to support `"copilot"` as an `LlmProvider`.
3. Modify `bots.json` to assign per-bot configurations if any bots should use Copilot defaults.
4. Refactor `src/utils/gemini.ts` to implement the updated strict `AiService`.
5. Create `src/utils/copilot.ts` and implement `CopilotService` with HTTP fetch logic.
6. Update `AgentRunner`, `OverseerPersona` (in `src/personas/overseer.ts`), and `TaskPersona` to consume the generic `AiService`. Remove the hardcoded `options.modelName` fallback in `agent_runner.ts`.
7. Extract the duplicated `personas` object creation from `src/index.ts` and `src/dispatch.ts` into a shared utility, wiring the correct provider (with `process.env.COPILOT_API_KEY` or `GITHUB_TOKEN` fallback) at startup based on the loaded bot configuration.
8. Delete `fix_test.cjs`, `patch_dispatch.cjs`, and `patch_index.cjs` from the repository root.