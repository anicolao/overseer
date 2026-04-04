# Operations

This document covers the workflow behavior and the artifact/debugging tools that exist today.

## Workflows

### CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main` and executes:

- `npm run lint`
- `npx tsc --noEmit`
- `npm test`

### Overseer Dispatcher

`.github/workflows/overseer.yml` is the active automation workflow.

It currently:

1. ignores bot-generated status-update and persistence-backstop comments
2. checks out or creates `bot/issue-<n>`
3. installs Nix and Node dependencies
4. runs `src/dispatch.ts` inside `nix develop`
5. runs the persistence backstop script
6. uploads session logs and trace JSONL artifacts

The workflow also records whether a persona actually executed through `GITHUB_OUTPUT`.

## Issue Branches

The working branch for issue `73` is `bot/issue-73`.

That convention is used by:

- `.github/workflows/overseer.yml`
- [`src/utils/persistence.ts`](../src/utils/persistence.ts)
- the persistence backstop script

## Persistence Backstop

`.github/scripts/persistence_backstop.sh` is the last line of defense after the dispatcher exits.

It checks whether local repository changes or commits were left behind without reaching `origin/bot/issue-<n>`. If so, it creates a `.backstop/persistence-backstop` artifact bundle containing:

- `metadata.json`
- `git-status.txt`
- `working-tree.diff`
- `index.diff`
- `remote-vs-head.diff` when a remote issue branch exists
- file copies for salvaged changed paths
- a prebuilt issue-comment body with the `<!-- overseer:persistence-backstop -->` sentinel

The dispatcher workflow uploads that bundle as `persistence-backstop-<run-id>` and posts the generated comment back to the issue.

## Trace and Log Artifacts

Each successful workflow run can upload:

- `agent-session-logs-<run-id>`
- `trace-jsonl-<run-id>`
- `persistence-backstop-<run-id>` when recovery is needed

### Session Logs

Session logs are the highest-fidelity view of a persona run. They contain:

- each iteration header
- the exact prompt payload sent into the model
- the raw structured JSON response
- action output

### Trace JSONL

Trace JSONL captures structured telemetry emitted by:

- the dispatcher
- personas
- Gemini request/response instrumentation
- shell execution
- persistence
- GitHub helpers

## Inspection Scripts

### Inspect Bots

`npm run bots:inspect`

Useful variants:

- `npm run bots:inspect -- developer-tester`
- `npm run bots:inspect -- --bot quality`

This script renders the current bot manifest, resolved prompt files, and concatenated prompts. It is the quickest way to see the actual instruction surface for a bot.

### Inspect Runs

`npm run runs:inspect -- <run-id>`

Useful variants:

- `npm run runs:inspect -- <run-id> --skip-download`
- `npm run runs:inspect -- <run-id> --artifacts-dir .artifacts/custom`

This script:

1. downloads workflow artifacts with `gh`
2. scans trace JSONL and backstop metadata
3. emits a markdown report under `.artifacts/run-<run-id>/run-<run-id>.md` by default

The generated report summarizes:

- persona flows
- observed iteration counts
- per-trace outcome (`finalized`, `max-iterations`, `aborted-for-loop`)
- persistence backstop metadata
- artifact inventory

## Useful Local Commands

General validation:

- `npm run lint`
- `npx tsc --noEmit`
- `npm test`

Run-specific debugging:

- `npm run runs:inspect -- <run-id>`
- `glow .artifacts/run-<run-id>/run-<run-id>.md`
- `sed -n '1,260p' .artifacts/run-<run-id>/agent-session-logs-<run-id>/session_<persona>_<timestamp>.log`

## Current Limitations

The current debugging toolchain is artifact-based and post-hoc:

- there is no external dashboard
- there is no durable database of runs
- run reports summarize traces, but session logs are still the authoritative source for step-by-step debugging
