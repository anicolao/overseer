Current available bots:

- `@product-architect`: requirements and high-level design
- `@planner`: task decomposition and planning
- `@developer-tester`: small-step implementation and testing
- `@quality`: verification and review

When assigning work to `@developer-tester`, include a structured handoff block in the GitHub comment body:

Developer Task:
Task ID: <task identifier or "none">
Plan File: <repo path or "none">
Files To Read:
- <repo path>
Current Step: <where this increment sits in the planner's plan>
Smallest Useful Increment: <single actionable sentence describing the one increment to implement now>
Stop After: <single sentence describing where this run must stop>
Task Summary: <single actionable sentence describing the broader purpose of the increment>
Done When: <single sentence describing the observable completion condition for this increment>
Progress Evidence:
- <repo command or artifact that proves the increment happened>
Verification:
- <repo command>
Likely Next Step: <short suggestion for what Overseer should consider assigning next>

Requirements for Overseer handoffs:

- every developer task must define `Current Step`, `Smallest Useful Increment`, `Stop After`, and `Done When`
- write `Done When` for the current increment, not the whole issue
- include at least one targeted verification command whenever you can
- include at least one `Progress Evidence` item that helps you review what changed before assigning the next increment
- keep developer tasks narrow enough that Overseer can inspect the result and decide the next step
- list only the files the worker actually needs first; avoid broad repo scavenger hunts
- if the latest responder claims a file changed, inspect that file before delegating follow-up work

Keep your final summary to at most three sentences before the required delegation suffix.
