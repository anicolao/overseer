# Technical Design: `persist_qa` Action

## Objective
Introduce a `persist_qa` action that saves quality assurance output directly to `docs/qa/...` and grant the `@quality` bot access to this action as well as `run_shell`.

## Motivation
Currently, quality assurance outputs might not be structured or persisted effectively by the `@quality` bot. By giving it dedicated permissions to run shell commands and persist QA results, we ensure that test plans, test results, and reviews are tracked in the repository.

## Implementation Details
The implementation integrates the `persist_qa` action into the core agent protocol and dispatcher:

1.  **Protocol Definition (`src/utils/agent_protocol.ts`)**
    - Add `persist_qa` to the allowed action types within the protocol schema.
    - Define the expected payload (e.g., target file path under `docs/qa/`, and the content to be saved).

2.  **Action Dispatch (`src/dispatch.ts`)**
    - Implement the handler for the `persist_qa` action.
    - Ensure the action safely writes the provided content to the specified path under the `docs/qa/` directory.
    - Implement authorization to ensure the `@quality` bot is allowed to invoke this action.
    - Verify that the `@quality` bot is also authorized to use `run_shell` for executing test commands.

## Integration Seam
- The overseer/dispatcher (`src/dispatch.ts`) intercepts the `persist_qa` action from the `@quality` bot's JSON response, validates it against the schema in `src/utils/agent_protocol.ts`, and routes it to the persistence logic.
- The protocol definition (`src/utils/agent_protocol.ts`) acts as the source of truth for the action's shape, ensuring that any payload passed to the dispatcher is well-formed.

## Future Work
- Human approval of this design before proceeding to implementation.
