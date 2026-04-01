# File Persistence Design

## Goal

Make persistence reliable without building a large dispatcher-side state machine.

The dispatcher should handle the git mechanics. The LLM should handle recovery inside its normal agentic loop. A task is not complete until the agent has verified that the issue branch on `origin` contains the changes it intended to make.

## Core Model

Add one dispatcher-owned tool action:

- `persist_work`

The agent uses normal file and shell actions to prepare changes. When it believes the work is ready, it calls `persist_work`. The dispatcher then performs the persistence mechanics and returns a structured result back into the same loop.

The agent is responsible for interpreting that result, fixing problems when possible, and trying again.

## Dispatcher Responsibilities

The dispatcher owns all git publishing mechanics:

1. Resolve the target branch for the issue, normally `bot/issue-<issueNumber>`.
2. Ensure persistence happens against that branch, not against `main`.
3. Stage and commit current workspace changes.
4. Push to the target branch.
5. Return a structured result to the agent.

The dispatcher should not claim success unless the push succeeded.

## `persist_work` Contract

The tool response should be explicit and machine-readable.

Success response:

```json
{
  "ok": true,
  "branch": "bot/issue-35",
  "commit_sha": "abc123",
  "changed_files": ["docs/plans/v2-implementation-plan.md"]
}
```

Failure response:

```json
{
  "ok": false,
  "branch": "bot/issue-35",
  "error_code": "non_fast_forward",
  "message": "Push rejected because remote branch has moved",
  "details": {
    "remote_branch_head": "def456"
  }
}
```

The dispatcher should return the real reason for failure, not a masked success string.

## Agent Responsibilities

The agent is not done when it writes a file. The agent is done only when all three are true:

1. It has called `persist_work`.
2. `persist_work` returned success.
3. It has independently checked that `origin/<target-branch>` contains the expected change.

That final verification can be done with normal read-only commands such as:

- `git fetch origin`
- `git show origin/bot/issue-35:path/to/file`
- `git diff origin/bot/issue-35~1 origin/bot/issue-35 -- path/to/file`

The persona prompt should state this plainly:

- do not claim repository success until branch verification is complete
- if persistence fails, diagnose the failure and try again
- if the failure is recoverable, continue working
- if the failure is not recoverable, explain exactly why and stop

## Expected Recovery Behavior

Most recovery should live in the LLM loop, not in hardcoded dispatcher branching.

Examples:

- If push fails because the remote branch moved, the agent should fetch, inspect branch state, reconcile its file changes, and call `persist_work` again.
- If the wrong file path was written, the agent should fix the file and call `persist_work` again.
- If there were no actual changes, the agent should detect that and stop claiming success.

The dispatcher only needs to report accurate mechanics-level failures. The agent handles the reasoning.

## Required Prompt Rule

All specialized personas that write files should be instructed:

- you are not finished when you write a file
- you are finished only after persistence succeeds and you verify the target branch contains the intended result

This removes the current false-positive behavior where an agent claims a document exists in the repository when it only existed in the ephemeral runner workspace.

## Happy Path Mechanics

The dispatcher implementation should still follow a safe happy path:

1. Work against the issue branch.
2. Commit only the current repository changes.
3. Push to the issue branch.
4. Return exact commit and branch information.

If this path fails, the dispatcher reports the failure back to the agent and the loop continues.

## Workflow Backstop

As a final safety net, the workflow should perform one last branch verification after the dispatcher finishes.

The workflow backstop should:

- compare the local worktree and local commits against `origin/bot/issue-<n>`
- ignore workflow-generated artifacts such as session logs
- detect when local repo changes exist but are not reflected on the issue branch
- save salvage artifacts such as diffs and file copies
- upload those artifacts
- post a dispatcher-authored issue comment explaining that persistence verification failed and recoverable artifacts were saved

This step is intentionally outside the dispatcher. It is the last line of defense against losing bot-authored files due to push failures, branch races, or incorrect success reporting.

## Why This Is Simpler

This design keeps the hardcoded system small:

- one persistence action
- one structured response shape
- one rule that success means branch verification, not local file creation

Everything else stays in the existing agentic loop, which is already the place where the system reasons about errors, retries, and next steps.

## Success Criteria

This design is successful when:

- agents can no longer silently lose work
- push failures are visible to the agent as failures
- agents retry persistence when recovery is possible
- agents stop claiming success before branch verification
- overseer decisions are based on work that actually exists on `origin/bot/issue-<n>`
