# Architecture: Nix-based Agent Execution Environment

To enable more robust and flexible agent interactions, Overseer is transitioning to a Nix-based execution model within GitHub Actions. This allows agents to behave as expert Linux developers, managing their own tools and executing complex workflows directly in a reproducible environment.

## 1. Core Concepts

### A. Repos-Centric Workspaces
The GitHub Action workflow will always clone the full repository into the runner's workspace before invoking any persona. This ensures agents have immediate, local access to all source files, documentation, and configuration.

### B. Nix Environment
The execution environment is powered by **Nix**. A `flake.nix` file at the root of the repository defines the base development environment. Agents are empowered to:
1.  **Execute Commands:** Use a standardized `[RUN:command]...[/RUN]` syntax to execute shell commands in the VM.
2.  **Manage Software:** Modify the `flake.nix` to add new dependencies, which Nix will then make available in the next execution or via `nix shell`.

### C. Expert Linux Developer Persona
All personas are instructed that they are operating in a Nix-on-Linux environment. They should prefer standard Unix tools and leverage the local filesystem for all operations (reading, writing, testing) rather than relying exclusively on API-based file management.

## 2. Technical Workflow

1.  **Trigger:** GitHub Event (Issue, Comment, etc.).
2.  **Setup:** 
    - GitHub Action runner starts.
    - Repository is cloned.
    - Nix is installed and the `flake.nix` environment is initialized.
3.  **Execution:**
    - Dispatcher invokes the target Persona.
    - Persona generates a response that may include `[RUN]` blocks.
    - Dispatcher executes the commands, captures stdout/stderr, and feeds it back to the agent or appends it to the issue.
4.  **Persistence:**
    - Agents use `git` to commit and push changes (on PR branches) directly from the VM.

## 3. Implementation Plan

1.  **Workflow Update:** Integrate `cachix/install-nix-action` and `DeterminateSystems/magic-nix-cache-action`.
2.  **Base Nix Configuration:** Create a foundational `flake.nix` and `devshell`.
3.  **Shell Execution Utility:** Add a `ShellService` to the Overseer hub to safely execute agent commands.
4.  **Persona Refactoring:** Update system prompts to emphasize local filesystem access and shell execution.

## 4. Verification Strategy
A non-LLM "Wire-Test" workflow will be implemented to verify:
- Successful Nix installation.
- Repository visibility within the Nix shell.
- Ability to execute and capture shell command output.
