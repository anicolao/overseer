# MVP Remediation 2: Context-Aware Execution

Following Attempt #5, a critical "disagreement loop" between the **Developer/Tester** and **Quality** personas has been identified. This loop prevents the system from making progress on complex tasks.

## 1. Identified Issues

### A. Developer "Context Blindness"
The `DeveloperTesterPersona` currently only receives the high-level `taskDescription` as context. It has **no visibility** into:
1.  The existing codebase (it cannot read the files it is refactoring).
2.  The full issue history (it cannot see previous Quality feedback or Architect designs).
As a result, it "hallucinates" a new, generic version of the project, accidentally deleting all core AI and orchestration logic every time it tries to refactor.

### B. Destructive File Overwrites
Because the Developer doesn't see the current code, its `[FILE:...]` outputs are wholesale replacements of entire files based on a narrow interpretation of the task.

### C. Quality Feedback Loop
The `Quality` persona is now correctly identifying these regressions (thanks to PR #22), but because the Developer still lacks context in the next iteration, it simply repeats the destructive behavior, leading to an infinite cycle of "Rejected -> Fix it -> Rejected".

## 2. Proposed Improvements

### 1. Full Context for Developers
Refactor `DeveloperTesterPersona` to receive the same `getFullIssueContext` and `getFilesRecursive` data as the Quality persona.
- The Developer will be able to read the actual code it is asked to modify.
- The Developer will see the specific "Changes Requested" from Quality in the issue history.

### 2. Guarded System Prompts
Update the `DeveloperTester` system instructions to explicitly prioritize:
- **Preservation:** "Do not remove existing functionality unless explicitly instructed."
- **Integration:** "Integrate new patterns into the existing architecture rather than replacing it."

### 3. Smart File Context
Modify the Dispatcher or Persona to automatically include the content of any file the persona is likely to touch (based on previous mentions or task names).

## 3. Technical Tasks

1.  **Refactor `DeveloperTesterPersona.handleTask`:**
    *   Fetch full issue context.
    *   Fetch relevant repository files (recursive `src` fetch).
2.  **Harden System Instructions:**
    *   Add "Preservation of existing logic" as a core directive for Developers.
    *   Instruct Developers to use comment history to understand implementation gaps.

## 4. Success Criteria
- The Developer successfully refactors code *without* deleting the Gemini integration or Persona classes.
- Quality approves a PR after 1-2 iterations of feedback.
- The system demonstrates "memory" of previous errors identified by Quality.
