# Bots Refactor

## Problem

The current bot implementation hides too much of the real instruction surface in TypeScript:

- prompt content lives in inline strings
- non-overseer bots are separate classes even though they all "receive a task and execute it"
- the trace tells us raw turn traffic, but not the prompt file inputs that produced the system prompt

That makes it difficult to answer two basic questions:

1. What exactly did we tell this bot?
2. Which behavior differences are real, versus accidental prompt drift between classes?

## Goals

- Define bots in a repository-level JSON manifest.
- Build prompts from ordered markdown files.
- Make the trace artifact include the prompt files and their full concatenated contents.
- Collapse the specialist bots into one generic task-execution persona class.
- Keep GitHub comment text as the canonical dynamic task packet.
- Share as much standing instruction as possible across bots.

## Non-Goals

- Replacing the dispatcher state machine.
- Replacing the JSON action protocol.
- Replacing dispatcher-owned persistence.
- Fully eliminating Overseer special handling in this first slice.

## Target Shape

Add a repository manifest:

`bots.json`

Each bot entry defines:

- `id`
- `display_name`
- `kind`
- `llm.provider`
- `llm.model`
- `prompt_files`
- `allow_persist_work`
- `max_iterations`

The dispatcher loads `bots.json`, reads each markdown prompt file in order, concatenates them deterministically, and hands the resulting system prompt to the runtime.

## Runtime Model

There should be only two runtime persona classes after this refactor:

- `OverseerPersona`
- `TaskPersona`

`TaskPersona` is the generic worker runtime for:

- `product-architect`
- `planner`
- `developer-tester`
- `quality`

Those bots differ by config and prompt files, not by separate TypeScript classes.

Overseer may remain special temporarily because it still owns orchestration-specific context gathering and routing behavior, but it should use the same manifest/prompt-loading path as every other bot.

## Prompt Model

The effective instruction to a bot is:

- concatenated prompt markdown from `bots.json`
- plus the triggering GitHub issue/comment body as the dynamic task input

There should be no second persona-specific task-construction layer in code for specialist bots.

If Overseer wants Developer to read files first, choose a branch, or implement a specific task id, that information belongs in the Overseer comment itself. The dispatcher should pass that comment body through directly to the selected bot.

## Trace Requirements

The trace artifact must let us reconstruct the full system prompt for every run.

For each executed bot, the trace must include:

- bot id
- display name
- provider/model
- ordered prompt file list
- each prompt file path and its full contents
- the full concatenated prompt contents
- the dynamic task input exactly as sent to the bot

This means the `.jsonl` artifact should be enough to answer:

- which markdown files defined the bot
- what those files contained at runtime
- what final system prompt string was actually used
- what GitHub message was passed in as the task

## Prompt Layout

Prompt files should be organized so shared rules are centralized:

- `prompts/shared/base.md`
- `prompts/shared/github-actions.md`
- `prompts/shared/agent-protocol.md`
- `prompts/shared/task-agent.md`
- `prompts/shared/persisting-agent.md`
- `prompts/shared/read-only-agent.md`
- `prompts/shared/overseer-core.md`
- `prompts/shared/developer-guidance.md`
- `prompts/overseer.md`
- `prompts/product-architect.md`
- `prompts/planner.md`
- `prompts/developer-tester.md`
- `prompts/quality.md`

Shared prompt files should carry rules like:

- read `AGENTS.md` if present
- use the JSON action protocol
- do not invent ad hoc git persistence
- keep the final GitHub-facing summary concise

Persona-specific prompt files should only contain role-specific behavior.

## Validation Rules

`bots.json` loading should fail closed on:

- duplicate bot ids
- unknown kinds
- invalid provider/model config
- empty prompt file arrays
- missing prompt files

## Migration Result

After this refactor:

- prompt review becomes markdown review
- specialist behavior differences are visible in config and prompt files
- the trace artifact contains the complete prompt source material
- adding or tightening a bot becomes data-driven instead of class-driven
- the only remaining "special" runtime should be Overseer, and even that should use the same prompt-loading path

## Recommendation

Implement this in one slice:

1. add `bots.json`
2. add prompt markdown files
3. add a manifest + prompt loader
4. trace prompt file contents and concatenated prompt text
5. replace the specialist classes with one generic `TaskPersona`
6. keep Overseer special only where orchestration still requires it
