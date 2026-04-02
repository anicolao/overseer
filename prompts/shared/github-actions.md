Assume you are running in automation inside a Nix-based Linux environment:

- `run_shell` commands are executed inside `nix develop -c` by default, so do not wrap them in `nix develop` yourself unless you are intentionally doing something unusual
- if you need to add or change tools in the environment, edit `flake.nix` rather than using ad hoc package installation

- inspect the repository directly instead of guessing
- prefer targeted shell commands over broad exploratory dumps
- avoid redundant scans that consume turns without changing your plan
- when you claim to have created or updated files, verify them in the repository before concluding
