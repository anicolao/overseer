# MVP Remediation 5: Payload Optimization & Reliable Attribution

Analysis of Attempt #6 reveals that while the Overseer (who typically runs first or on smaller contexts) succeeds, the **Product/Architect** and **Quality** personas are consistently "hanging" and failing to contact the LLM. This is due to a combination of context payload explosion and inefficient recursive API calls.

## 1. Identified Issues

### A. Context Payload Explosion
The `getFullIssueContext` method fetches and concatenates **every comment** on an issue. In a long-running issue like #25, this payload can exceed several megabytes. The `fetch` call to the Gemini API likely times out or is rejected by the model due to sheer size before the first turn completes.

### B. Recursive API Thrashing (The "Quality" Hang)
The `Quality` persona currently attempts to fetch **every file in the `src` directory** using recursive GitHub API calls (`getFilesRecursive`). In a repo with dozens of files, this triggers 50+ network requests, which is extremely slow and likely hits rate limits or job timeouts in the GitHub Action environment.

### C. Attribution and Linking Regression
The current attribution logic often fails to correctly identify the "Sender Persona" because it relies on a specific string match that can be fragile. Additionally, deep links to comments are sometimes replaced by generic issue links.

## 2. Proposed Structural Improvements

### 1. Truncated "Smart" Context
Refactor `GitHubService.getFullIssueContext` to:
- **Truncate individual comments:** Cap each comment at 5,000 characters.
- **Limit total history:** Only include the last 15-20 comments.
- **Prioritize Metadata:** Ensure the original Issue Body is always preserved, but older intermediate bot chatter is trimmed.

### 2. Shift to VM-Native Discovery
Remove `getFilesRecursive` from the `Quality` persona.
- **Instead of pre-fetching:** Inform the Quality persona that it should use `[RUN: find src]` and `[RUN: cat path/to/file]` to inspect the repository lazily within its internal loop.
- **Performance:** This reduces 50+ network calls to 1 local shell command.

### 3. Hardened Attribution Headers
Every bot response will be prefixed with a robust, hyperlinked header that cannot be easily misparsed:
> **Overseer** responding to **[this comment]** from **Architect**

## 3. Technical Tasks

1.  **Refactor `GitHubService`:**
    *   Add aggressive truncation to `getFullIssueContext`.
    *   Remove `getFilesRecursive` (obsolete).
2.  **Harden `dispatch.ts`:**
    *   Improve the regex for `senderPersona` extraction.
    *   Ensure `commentUrl` is passed accurately for all event types.
3.  **Optimize Personas:**
    *   `Quality`: Remove the massive repo-state fetch and update the system prompt to favor `[RUN]` for discovery.

## 4. Success Criteria
- The Product/Architect successfully contacts the LLM even in large issues.
- The Quality persona completes its review in < 2 minutes (currently timing out).
- Every comment contains a valid deep link to its parent.
