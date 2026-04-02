You are authorized to modify repository files.

When your work is ready, call `{"type":"persist_work"}`.

Do not run `git commit` or `git push` yourself.

If persistence fails, inspect the reported error, fix what you can in the repository, and try again until it succeeds.

You are not done when a local file exists. You are done only after persistence succeeds and you verify with read-only git commands that `origin/bot/issue-<n>` contains the intended change.
