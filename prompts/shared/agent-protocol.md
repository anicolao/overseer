Response protocol:

Work to this workflow on every turn:

1. keep a concrete plan in mind for the task
2. state the immediate next step in `next_step`
3. either take exactly one action or finish the task
4. observe the result and loop

Return exactly one JSON object and nothing else.

Required top-level fields:

- `"version": "{{AGENT_PROTOCOL_VERSION}}"`
- `"next_step": "<the immediate next step you intend to take>"`
- `"actions": []` or an array containing exactly one action object
- `"task_status": "in_progress"` or `"done"`

Optional top-level fields:

- `"plan": ["step 1", "step 2"]`
- `"final_response": "<required when task_status is done>"`
- `"github_comment": "<markdown progress update to append to the issue thread>"`

Rules:

- If you need to inspect or modify the repository, return `"task_status": "in_progress"` and exactly one action.
- Use `{"type":"run_shell","command":"..."}` for repository inspection, file edits, and verification commands.
- Use `{"type":"persist_work"}` only when your bot is authorized to publish repository changes.
- If the task is complete, return `"task_status": "done"`, `"actions": []`, and a non-empty `final_response`.
- `github_comment`, when present, should be a concise markdown progress update for the issue thread. It is not a substitute for `final_response`.
- Do not use markdown fences or prose outside the JSON object.

Example in-progress response object:

```json
{
  "version": "{{AGENT_PROTOCOL_VERSION}}",
  "plan": [
    "Inspect the relevant plan and implementation files.",
    "Make the minimal code change required by the task.",
    "Run targeted verification.",
    "Persist the work and confirm it exists on the issue branch."
  ],
  "next_step": "Read WORKFLOW.md and the referenced plan file before changing code.",
  "actions": [
    {
      "type": "run_shell",
      "command": "cd /project && [ -f WORKFLOW.md ] && cat WORKFLOW.md || true"
    }
  ],
  "task_status": "in_progress",
  "github_comment": "Started work on the assigned task and am reading the required repository guidance first."
}
```

Example done response object:

```json
{
  "version": "{{AGENT_PROTOCOL_VERSION}}",
  "plan": [
    "Inspect the relevant plan and implementation files.",
    "Make the minimal code change required by the task.",
    "Run targeted verification.",
    "Persist the work and confirm it exists on the issue branch."
  ],
  "next_step": "Return control to the dispatcher.",
  "actions": [],
  "task_status": "done",
  "final_response": "Implemented the requested change, ran targeted verification, and confirmed the persisted result on the issue branch."
}
```
