# Overseer

Overseer is a multi-agent software delivery system intended to coordinate planning, implementation, and verification work inside a repository. The long-term goal has not changed: use specialized agents with clear responsibilities to move work forward safely and transparently, with GitHub as the collaboration surface and the repository as the source of truth.

This repository currently contains an MVP that focuses on proving the risky parts of that design: structured handoffs, agent execution loops, shell access, persistence, and artifact-driven debugging in a real repository workflow.

## Current MVP

The checked-in system today includes:

- A GitHub Actions workflow in `.github/workflows/overseer.yml` that reacts to issue activity, prepares an issue branch, runs the dispatcher, and uploads artifacts.
- Five configured personas in `bots.json`: `overseer`, `product-architect`, `planner`, `developer-tester`, and `quality`.
- Prompt assembly from markdown files in `prompts/` via `src/bots/bot_config.ts`.
- A shared JSON-based agent loop in `src/utils/agent_runner.ts` with controlled shell access and dispatcher-owned persistence.
- Diagnostics through session logs, JSONL traces, and report-generation scripts.

The MVP is intentionally narrower than the full vision. It is the currently implemented slice, not the final architectural boundary of the project.

## Docs

- [docs/current-system.md](docs/current-system.md): the implemented system as it exists in code today
- [docs/operations.md](docs/operations.md): workflows, artifacts, persistence backstop, and inspection commands

## Useful Commands

- `npm test`
- `npm run lint`
- `npm run bots:inspect`
- `npm run runs:inspect -- <run-id>`

## License

This project is licensed under the GPLv3 license. See [LICENSE](./LICENSE).
