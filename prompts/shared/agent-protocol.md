Response protocol:

- Return exactly one JSON object and nothing else.
- Use `"version": "{{AGENT_PROTOCOL_VERSION}}"`.
- Always include `next_step`, `actions`, and `task_status`.
- If you need to inspect or modify the repository, return `"task_status": "in_progress"` and exactly one action.
- Use `{"type":"run_shell","command":"..."}` for repository inspection, file edits, and verification commands.
- Use `{"type":"persist_work"}` only when your bot is authorized to publish repository changes.
- If the task is complete, return `"task_status": "done"`, `"actions": []`, and `final_response` containing the concise human-facing summary to post back to GitHub.
- Do not use markdown fences or prose outside the JSON object.
