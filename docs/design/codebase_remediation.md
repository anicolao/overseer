# Codebase Remediation Plan

## Objective
Provide a detailed critique and remediation plan for cleaning up the codebase prototype, focusing on removing extraneous functionality, eliminating duplicate code, and addressing missing test coverage.

## Critique

### Extraneous Functionality and Duplicate Code
- **`src/index.ts`**: This file contains outdated webhook logic (`overseerWebhook` using Express) that duplicates the event processing, routing, and persona execution functionality actively handled by `src/dispatch.ts`. Because the project relies exclusively on GitHub Actions (`.github/workflows/overseer.yml`) and `src/dispatch.ts` for its execution layer, `src/index.ts` is extraneous and creates a risk of architectural drift.
- **`src/wire_test.ts`**: A stale, standalone script intended to verify Nix VM environments (`ls`, `node --version`, `gh --version`). It is not integrated into `package.json` scripts or CI workflows.

### Missing Test Coverage
Critical system interaction boundaries lack unit tests, leaving the core infrastructure vulnerable to regressions:
- **`src/utils/gemini.ts`**: The Gemini API client layer lacks test coverage.
- **`src/utils/github.ts`**: The GitHub API client wrapper is untested.
- **`src/utils/prompt_files.ts`**: The prompt loading and rendering utility is untested.
- **`src/utils/trace.ts`**: The async local storage tracing setup lacks validation tests.
- **`src/scripts/run_task_persona.ts`**: The local CLI test execution runner is completely untested.

## Remediation Plan

### Increment 1: Remove Extraneous Files
- **Action**: Delete `src/index.ts` and `src/wire_test.ts`. 
- **Action**: Remove `express` and `@types/express` from `package.json` dependencies if they are no longer needed elsewhere.
- **Validation**: Ensure `npm run build` succeeds and the project is still correctly invokable via `nix develop --command npx tsx src/dispatch.ts`.

### Increment 2: Expand Core Utility Tests
Implement unit tests for core utilities:
- **Action**: Create `src/utils/gemini.test.ts` to test Gemini API interaction behavior.
- **Action**: Create `src/utils/github.test.ts` to validate GitHub API data retrieval, issue reading, and comment posting functionality.
- **Action**: Create `src/utils/prompt_files.test.ts` to ensure templates load and variables are substituted correctly.
- **Action**: Create `src/utils/trace.test.ts` to validate the `AsyncLocalStorage` context correctly attributes payload traces.
- **Validation**: Ensure `npm test` passes on all newly added test files.

### Increment 3: Expand Script Tests
- **Action**: Create `src/scripts/run_task_persona.test.ts` to test CLI argument parsing (`parseArgs`) and behavior configuration.
- **Validation**: Ensure `npm test` successfully executes the script's tests.

## Affected Files and Seams
- `src/index.ts` (To be deleted)
- `src/wire_test.ts` (To be deleted)
- `package.json` (Dependency removals)
- `src/utils/gemini.test.ts` (New file)
- `src/utils/github.test.ts` (New file)
- `src/utils/prompt_files.test.ts` (New file)
- `src/utils/trace.test.ts` (New file)
- `src/scripts/run_task_persona.test.ts` (New file)
