# Current System

This document describes the code that exists in the repository today. It is intentionally narrower than the broader project vision: it documents the implemented MVP and current runtime behavior, not the full intended end-state of Overseer.

## Overview

Overseer currently runs as a GitHub Actions workflow that dispatches issue and issue-comment events to Gemini-backed personas. The system is repository-local and issue-centric:

- work is routed through GitHub issues and issue comments
- active execution state is tracked with `active-persona:*` labels
- bot-authored repository changes are persisted to `bot/issue-<n>` branches
- session logs and JSONL traces are uploaded as workflow artifacts

The primary runtime entrypoint is [`src/dispatch.ts`](../src/dispatch.ts). [`src/index.ts`](../src/index.ts) still exists as an Express webhook handler, but the checked-in production path is the GitHub Actions dispatcher.

## Runtime Flow

1. `.github/workflows/overseer.yml` triggers on `issues`, `issue_comment`, and `pull_request` events.
2. The workflow checks out the repository, prepares or checks out `bot/issue-<n>`, installs dependencies, and runs `nix develop --command npx tsx src/dispatch.ts`.
3. [`src/dispatch.ts`](../src/dispatch.ts) loads `bots.json`, builds persona instances, reads the GitHub event payload, enforces the active-persona state machine, and executes exactly one persona for the event.
4. The selected persona calls [`src/utils/agent_runner.ts`](../src/utils/agent_runner.ts), which manages the iterative Gemini loop.
5. The dispatcher posts the final GitHub comment, updates the active persona label, uploads logs/traces, and runs the persistence backstop script.

## Personas

Configured in [`bots.json`](../bots.json):

| Bot | Kind | Shell Access | Persist Work | Primary Role |
| --- | --- | --- | --- | --- |
| `overseer` | `overseer` | `read_only` | no | orchestration and handoff decisions |
| `product-architect` | `task` | `read_write` | yes | requirements and high-level design artifacts |
| `planner` | `task` | `read_write` | yes | planning artifacts and task decomposition |
| `developer-tester` | `task` | `read_write` | yes | small-step implementation and verification |
| `quality` | `task` | `read_only` | no | review and verification |

Persona prompts are assembled from ordered markdown files under `prompts/`. The prompt loader is [`src/bots/bot_config.ts`](../src/bots/bot_config.ts).

## Prompt and Task Model

### Prompt Assembly

[`src/bots/bot_config.ts`](../src/bots/bot_config.ts) loads `bots.json`, validates each bot definition, reads the referenced prompt files, expands prompt templates, and produces the concatenated system prompt sent to Gemini.

Shared prompt files under `prompts/shared/` define:

- repository and GitHub Actions environment assumptions
- the JSON response protocol
- task-agent and overseer behavior
- persistence and read-only rules

### Structured Task Packets

Task bots do not receive raw issue comments directly. [`src/utils/task_packet.ts`](../src/utils/task_packet.ts) parses Overseer handoffs into a normalized packet with fields like:

- `Task ID`
- `Plan File`
- `Files To Read`
- `Current Step`
- `Smallest Useful Increment`
- `Stop After`
- `Done When`
- `Progress Evidence`
- `Verification`
- `Likely Next Step`

[`src/personas/task_persona.ts`](../src/personas/task_persona.ts) renders that packet back into a canonical prompt payload before entering the agent loop.

## JSON Agent Protocol

[`src/utils/agent_protocol.ts`](../src/utils/agent_protocol.ts) defines the only supported response protocol:

- protocol version: `overseer/v1`
- required top-level fields: `plan`, `next_step`, `actions`, `task_status`
- supported action types:
  - `run_ro_shell`
  - `run_shell`
  - `persist_work`

There is no `persist_qa` action in the current code.

`task_status: "done"` is validated strictly:

- actions must be empty
- `final_response` must be present
- some personas must also set `handoff_to`

## Agent Runner

[`src/utils/agent_runner.ts`](../src/utils/agent_runner.ts) is the shared execution loop for all personas.

It is responsible for:

- starting a Gemini chat with the assembled system prompt
- sending the initial task and each continuation message
- validating structured protocol responses
- enforcing per-bot action-count limits
- executing shell and persistence actions
- tracking whether a bot has written locally, persisted successfully, and verified the persisted branch state
- rejecting `done` responses that skip required persistence/verification after `run_shell`
- attempting loop repair when the same response/action fingerprint repeats

Current loop detection is fingerprint-based. It only recognizes repeated cycles when the plan, next step, action payload, and execution result stay effectively the same.

## Shell Execution

[`src/utils/shell.ts`](../src/utils/shell.ts) exposes two execution modes:

- `read_only`: copies the repo into a temporary sandbox, marks the copied tree non-writable, and runs commands there
- `read_write`: runs commands in the live checkout

Both modes wrap commands with `nix develop -c bash -lc ...` unless the command already starts with `nix develop`.

## Persistence

[`src/utils/persistence.ts`](../src/utils/persistence.ts) owns git mechanics for bot-authored changes.

Key behaviors:

- issue branches are named `bot/issue-<n>`
- the service can create or check out the issue branch from `origin/main`
- `persist_work` stages tracked and untracked changes, commits them with a persona-specific message, and pushes to the issue branch
- session logs and `.backstop/` paths are excluded from persistence

Task bots do not run `git commit` or `git push` directly; they call `persist_work` through the runner.

## GitHub Integration

[`src/utils/github.ts`](../src/utils/github.ts) wraps the subset of Octokit functionality the dispatcher uses today:

- reading issue bodies/comments/labels
- posting issue comments
- updating labels
- assembling a truncated full issue context for Overseer

The current system uses GitHub issues and labels as its coordination layer. It does not use GitHub Projects, Discussions, or a separate app per persona.

## Tracing and Diagnostics

[`src/utils/trace.ts`](../src/utils/trace.ts) writes structured JSONL traces for dispatcher, Gemini, shell, and GitHub-related events.

The main debugging surfaces are:

- session logs written by the runner and uploaded by the workflow
- JSONL trace artifacts
- the persistence backstop artifact produced by `.github/scripts/persistence_backstop.sh`
- report-generation scripts under `src/scripts/`

## Auxiliary Files

- [`src/scripts/inspect_bots.ts`](../src/scripts/inspect_bots.ts): renders bot manifest/prompt details as markdown
- [`src/scripts/inspect_run.ts`](../src/scripts/inspect_run.ts): downloads run artifacts and builds a markdown summary
- [`src/wire_test.ts`](../src/wire_test.ts): manual shell/Nix environment smoke test

## Test Coverage

The repository includes focused tests for the current runtime contracts:

- bot manifest loading and prompt expansion
- protocol parsing
- runner validation and loop repair
- shell read-only behavior
- task packet parsing
- inspection scripts

See `src/**/*.test.ts`.
