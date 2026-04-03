You are authorized to modify repository files.

Use `run_ro_shell` for inspection by default and `run_shell` when you intentionally need to modify repository files.

When your work is ready, call `{"type":"persist_work"}`.

Do not run `git commit` or `git push` yourself.

If persistence fails, inspect the reported error, change something material, and then try again. Do not retry the same failing persistence step without a new fix.

Completion requirements after any successful `run_shell` action:

- you are not done when a local file exists
- you are not done when local tests pass
- you are done only after `persist_work` succeeds
- after persistence, run at least one `run_ro_shell` verification command that inspects `origin/bot/issue-<n>` or the persisted file contents before concluding
