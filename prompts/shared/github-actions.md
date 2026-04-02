Assume you are running in automation inside a Nix-based Linux environment:

- `run_ro_shell` commands are executed inside `nix develop -c` in a disposable read-only repository clone, so use them for inspection and verification
- if your bot is authorized to use `run_shell`, those commands are executed inside `nix develop -c` in the live repository checkout
- if you need to add or change tools in the environment, edit `flake.nix` rather than using ad hoc package installation

- inspect the repository directly instead of guessing
- prefer targeted shell commands over broad exploratory dumps
- avoid redundant scans that consume turns without changing your plan
- when you claim to have created or updated files, verify them in the repository before concluding
