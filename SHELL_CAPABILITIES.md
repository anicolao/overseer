## Goal

Split shell access into a read-only path for every bot and a read-write path only for bots that are allowed to modify the repository.

## Design

- Add `trace_*.jsonl` to `.gitignore` so trace artifacts do not become candidate bot output.
- Add `shell_access` to `bots.json` with two values:
  - `read_only`
  - `read_write`
- Add a new protocol action:
  - `{"type":"run_ro_shell","command":"..."}`
- Keep `{"type":"run_shell","command":"..."}` only for read-write bots.
- Keep `persist_work` separate from shell access. A bot may be read-write and still be forbidden from publishing changes.

## Runtime Behavior

- `run_ro_shell` executes inside `nix develop -c` in a disposable read-only clone of the current repository.
- The clone's working tree is made non-writable before command execution.
- Temporary files, HOME, and TMPDIR live outside the read-only tree so normal inspection tools still work.
- `run_shell` continues to execute inside the live repository checkout and is available only to bots with `shell_access: "read_write"`.
- The runner must reject any action the current bot is not authorized to use.

## Prompting

- Shared protocol docs must describe both shell actions.
- Read-only bots must be told to use `run_ro_shell` for inspection and verification only.
- Read-write bots must be told to use `run_ro_shell` for inspection and `run_shell` when they intentionally need to edit repository files.
- All prompt text should make it explicit that the environment is a Nix-based Linux environment and that `flake.nix` is the place to change tooling.

## Scope

- This change does not introduce a general OS sandbox or network isolation layer.
- The protection target is the repository working tree. The read-only shell should prevent writes there, which is the failure mode that confused Overseer and other review bots.
