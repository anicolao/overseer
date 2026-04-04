# Design: Persist QA Action and Quality Bot Shell Access

## Objective
Enable the Quality bot to write test observations, plans, and quality reports to `docs/qa/` and persist these changes using a dedicated `persist_qa` action.

## Context
Currently, the Quality bot has `read_only` shell access and no permission to persist work. To actively contribute to the QA process, it needs to generate reports and save them to the repository without accidentally committing source code changes.

## Proposed Changes

### 1. Bot Configuration (`bots.json` & `src/bots/bot_config.ts`)
- **`bots.json`**: Update the `quality` bot configuration:
  - Change `"shell_access": "read_only"` to `"shell_access": "read_write"`.
  - Add `"allow_persist_qa": true` to its configuration.
- **`src/bots/bot_config.ts`**: Update the `BotConfig` interface to include the new optional boolean flag `allow_persist_qa?: boolean`.

### 2. Agent Protocol (`src/utils/agent_protocol.ts`)
- Define a new action type in the protocol: `persist_qa`.
- This action will signal the dispatcher to persist QA-specific artifacts, similar to `persist_work` but tailored for the quality bot's domain.

### 3. Persistence Layer (`src/utils/persistence.ts`)
- Add a new method `persistQA(issueNumber: number, persona: string)` alongside `persistWork()`.
- **Restriction Mechanism**: Instead of broad staging (`git add -A -- .`), `persistQA` will strictly stage the QA directory: `git add -A -- docs/qa/`.
- This isolation limits the bot's persistence capabilities, ensuring it cannot commit source code files even though it now has `read_write` shell access to run write-dependent tooling.

### 4. Prompt Updates (`prompts/quality.md`)
- Instruct the Quality bot that it can now use `run_shell` to create/update files within `docs/qa/`.
- Provide guidelines on the expected format for QA reports.
- Instruct the bot to explicitly call the `persist_qa` action when its local QA observations are ready to be pushed to the repository.

## Security & Restrictions
While `run_shell: read_write` access technically allows the bot to modify any file in the local checkout, restricting the staging boundary to `docs/qa/` in `persistQA()` ensures that any unintended local modifications outside of this directory will not be persisted to the remote issue branch.
