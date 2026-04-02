# Plan: Add `persist_qa` Action for Quality Bot (Issue #57)

## Overview
The Quality Bot needs a mechanism to persist its QA results (e.g. updating `qa_metrics.json`) and signal that QA is complete. We will introduce a new `persist_qa` action in the agent protocol specifically for this purpose.

## Implementation Touchpoints

### 1. `src/utils/agent_protocol.ts`
- **Interfaces**: Add `PersistQaAction` with `type: "persist_qa"`.
- **Types**: Update `AgentAction` union to include `PersistQaAction`.
- **Prompt**: Update `AGENT_PROTOCOL_PROMPT` to list `{"type":"persist_qa"}` as an available action, explaining that it is specifically for the Quality bot to finalize its QA results.
- **Parsing**: Update `parseAction` to recognize and parse the `persist_qa` type.

### 2. `src/utils/agent_runner.ts`
- **Options**: Add `persistQa?: () => Promise<PersistWorkResult>;` to `AgentRunnerOptions`.
- **Execution**: In `executeActions`, handle `action.type === "persist_qa"`. If `options.persistQa` is available, call it and return the JSON stringified result. If not, return a structured JSON error indicating it is not available for this persona.

### 3. `prompts/shared/agent-protocol.md`
- **Documentation**: Update the shared protocol documentation to include the `persist_qa` action alongside `run_shell` and `persist_work`.
- **Guidelines**: Explain that `persist_qa` commits QA metrics and finalizes the QA review process.

### 4. `prompts/quality.md`
- **Instructions**: Update the Quality bot's specific system prompt to instruct it to use `{"type":"persist_qa"}` when it has verified the work and updated QA tracking files.

## Developer Instructions
- Implement the above touchpoints.
- Ensure TypeScript compiles.
- Note that `AgentRunnerOptions` will need a new optional callback `persistQa`, which the dispatcher will implement to actually perform the QA commit and PR approval.
