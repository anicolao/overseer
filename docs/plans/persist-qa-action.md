# Implementation Plan: persist_qa action

## Step 1: Capability Definition and Bot Config
- **bots.json**: Add `"allow_persist_qa": true` to the `@quality` bot configuration.
- **src/bots/bot_config.ts**: Add `allow_persist_qa: boolean` to the `BotConfig` interface and parse it, defaulting to `false`.

## Step 2: Action Protocol Parsing
- **src/utils/agent_protocol.ts**: Add `persist_qa` to the `AgentAction` type union as `{ type: "persist_qa" }`.
- **src/utils/agent_protocol.ts**: Update the JSON schema and parsing logic to accept `{"type": "persist_qa"}`.

## Step 3: Runtime Execution and Wiring
- **src/personas/task_persona.ts**: Inject `allow_persist_qa: botConfig.allow_persist_qa` into the capabilities given to `AgentRunner`.
- **src/utils/agent_runner.ts**: Handle the `persist_qa` action in the dispatch loop. Ensure it checks the `allow_persist_qa` capability, fails if unprivileged, and calls the persistence utility if permitted.

## Step 4: Prompt Updates
- **prompts/quality.md**: Document the `persist_qa` protocol. Clarify that `@quality` must use `run_shell` to modify `docs/qa/` files first, then invoke `{"type": "persist_qa"}` without any payload to persist those changes.
