# Overseer

Overseer is a GitHub Actions based multi-agent dispatcher for one repository. It reacts to issues and issue comments, routes work between a small set of personas, executes Gemini-driven task loops through a strict JSON protocol, and persists bot-authored changes onto issue branches like `bot/issue-73`.

## What Exists Today

- A GitHub Actions workflow in `.github/workflows/overseer.yml` that checks out the repo, prepares the issue branch, runs `src/dispatch.ts`, uploads session logs and trace artifacts, and invokes a persistence backstop.
- Five configured personas in `bots.json`: `overseer`, `product-architect`, `planner`, `developer-tester`, and `quality`.
- Prompt assembly from ordered markdown files in `prompts/` via `src/bots/bot_config.ts`.
- A shared task loop in `src/utils/agent_runner.ts` with three supported actions: `run_ro_shell`, `run_shell`, and `persist_work`.
- Dispatcher-owned persistence in `src/utils/persistence.ts`.
- JSONL tracing plus report-generation scripts in `src/utils/trace.ts`, `src/scripts/inspect_bots.ts`, and `src/scripts/inspect_run.ts`.

## What Does Not Exist

The current codebase does not implement the larger historical designs that used to be documented here. In particular, there is no:

- GitHub Project v2 control plane
- separate GitHub App per persona
- event bus or background worker fleet
- database or vector-store memory layer
- multimodal or voice Live API control surface
- `persist_qa` action

## Docs

- [docs/current-system.md](docs/current-system.md): current architecture, runtime model, file map, and supported behavior
- [docs/operations.md](docs/operations.md): workflows, artifacts, persistence backstop, and inspection commands

## Useful Commands

- `npm test`
- `npm run lint`
- `npm run bots:inspect`
- `npm run runs:inspect -- <run-id>`

## License

This project is licensed under the GPLv3 license. See [LICENSE](./LICENSE).
