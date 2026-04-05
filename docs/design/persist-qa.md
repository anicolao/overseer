# Technical Design: `persist_qa` Action

## Objective
Introduce a `persist_qa` action to persist quality assurance artifacts and results, and ensure the `@quality` bot has appropriate capabilities.

## Architecture & Implementation Seams

To implement this feature end-to-end, changes are required across the following boundaries:

### 1. Prompt Content (`prompts/quality.md`)
The system prompt for the quality bot must be updated to explain the existence, purpose, and usage of the `persist_qa` action. It should instruct the bot to save its test plans and validation results using this action.

### 2. Manifest & Configuration (`bots.json` & `src/bots/bot_config.ts`)
- **`bots.json`**: The `@quality` bot's configuration block must be updated to grant it the capability to perform the `persist_qa` and `run_shell` actions. (Note: Permissions must use the native schema properties defined in the project; no fictional `allowed_actions` field will be used).
- **`src/bots/bot_config.ts`**: The types and configuration parsing logic must support the new bot manifest definitions to ensure the `@quality` bot correctly inherits the new action capabilities at config load time.

### 3. Protocol / Schema (`src/utils/agent_protocol.ts`)
The `persist_qa` action needs to be formally defined in the agent protocol schema. This includes defining the action type and its expected payload parameters (e.g., target file path under `docs/qa/` and the file content).

### 4. Runtime Execution (`src/utils/agent_runner.ts`)
The core execution loop must be extended to process the `persist_qa` action when yielded by an agent. This involves reading the payload from the protocol, performing the file system write operation to the appropriate directory, and returning the result to the agent.

### 5. Runtime Wiring (`src/personas/task_persona.ts`)
The persona wiring logic must correctly hook the `persist_qa` action into the runtime environment for the `@quality` bot. This ensures the configuration and the protocol are connected so the agent runner actually invokes the new action handler when requested by the `@quality` persona.
