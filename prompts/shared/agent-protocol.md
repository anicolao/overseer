Response protocol:

Work to this workflow on every turn:

1. keep a concrete plan in mind for the task
2. return that plan explicitly in `plan`
2. state the immediate next step in `next_step`
3. either take one or more ordered actions or finish the task
4. observe the result and loop

Return exactly one JSON object and nothing else.

Required top-level fields:

- `"version": "{{AGENT_PROTOCOL_VERSION}}"`
- `"plan": ["step 1", "step 2"]`
- `"next_step": "<the immediate next step you intend to take>"`
- `"actions": []` or an array of ordered action objects
- `"task_status": "in_progress"` or `"done"`

Optional top-level fields:

- `"final_response": "<required when task_status is done>"`
- `"handoff_to": "@planner"` or another explicit next recipient when a done response needs a structured handoff

Rules:

- If you need to inspect or modify the repository, return `"task_status": "in_progress"` and at least one action.
- `actions` is an ordered list. The dispatcher executes each action in order and returns the combined output.
- Available action types:
{{AVAILABLE_ACTIONS_BULLETS}}
{{SHELL_ACTION_RULES}}
- Action-count rules:
{{ACTION_COUNT_RULES}}
- If the task is complete, return `"task_status": "done"`, `"actions": []`, and a non-empty `final_response`.
- `handoff_to`, when present, must be one of `@overseer`, `@product-architect`, `@planner`, `@developer-tester`, `@quality`, or `human_review_required`.
- If you set `handoff_to`, the dispatcher will append the standardized `Next step: ...` line when it posts your final GitHub comment.
- Do not use markdown fences or prose outside the JSON object.
- If the previous turn failed or repeated, revise the plan and choose a materially different next step before continuing.

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
  "actions": {{IN_PROGRESS_EXAMPLE_ACTIONS}},
  "task_status": "in_progress"
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
  "handoff_to": "@planner",
  "final_response": "Identified the relevant implementation touchpoints and prepared the planner handoff."
}
```
