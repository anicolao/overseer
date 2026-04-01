# Bots Refactor

## Problem

The current bot/persona implementation mixes three separate concerns inside TypeScript classes:

- persona identity and routing
- LLM provider/model configuration
- prompt content

That has made the system hard to reason about and hard to improve. The prompt content is spread across several large inline strings in `src/personas/*.ts`, while the actual message sent to a persona often contains too much generic issue context and not enough targeted task information. This makes it difficult to understand what each persona is actually being told, and it makes prompt iteration unnecessarily expensive.

`morpheum` uses a simpler pattern:

- a JSON file defines each bot's identity, prompt, and LLM config
- prompt text lives in markdown files
- configuration can be inspected without reading code

Overseer should move in that direction.

## Goals

- Move persona definition out of inline TypeScript prompt strings.
- Make prompt composition inspectable and reviewable as markdown.
- Share as much prompt content as possible across personas.
- Reduce accidental prompt drift between personas.
- Make it easy to see exactly which files define a persona.
- Keep routing, persistence, and execution behavior in code.
- Make the GitHub issue/comment text the canonical dynamic task packet.
- Preserve the existing persona set and current workflow behavior during migration.

## Non-Goals

- Changing the agent protocol in this refactor.
- Replacing the dispatcher state machine.
- Changing the persistence design.
- Introducing runtime prompt editing by the LLM.

## Proposed Shape

Add a repository-level manifest, for example:

`bots.json`

```json
{
  "defaults": {
    "llm": {
      "provider": "gemini",
      "model": "gemini-3.1-pro-preview"
    },
    "prompt_files": [
      "prompts/shared/base.md",
      "prompts/shared/github-actions.md",
      "prompts/shared/agent-protocol.md"
    ]
  },
  "bots": [
    {
      "id": "overseer",
      "display_name": "Overseer",
      "prompt_files": [
        "prompts/shared/reviewer-core.md",
        "prompts/overseer.md"
      ]
    },
    {
      "id": "product-architect",
      "display_name": "Product/Architect",
      "prompt_files": [
        "prompts/shared/writer-core.md",
        "prompts/product-architect.md"
      ]
    },
    {
      "id": "planner",
      "display_name": "Planner",
      "prompt_files": [
        "prompts/shared/writer-core.md",
        "prompts/planner.md"
      ]
    },
    {
      "id": "developer-tester",
      "display_name": "Developer/Tester",
      "prompt_files": [
        "prompts/shared/writer-core.md",
        "prompts/shared/developer-core.md",
        "prompts/developer-tester.md"
      ]
    },
    {
      "id": "quality",
      "display_name": "Quality",
      "prompt_files": [
        "prompts/shared/reviewer-core.md",
        "prompts/quality.md"
      ]
    }
  ]
}
```

Each persona prompt is built by concatenating `prompt_files` in order with a simple separator.

## Prompt Layout

The prompt directory should be structured so shared policy is separate from persona-specific direction.

Example:

- `prompts/shared/base.md`
- `prompts/shared/github-actions.md`
- `prompts/shared/agent-protocol.md`
- `prompts/shared/repository-guidance.md`
- `prompts/shared/persistence-rules.md`
- `prompts/shared/writer-core.md`
- `prompts/shared/reviewer-core.md`
- `prompts/shared/developer-core.md`
- `prompts/overseer.md`
- `prompts/product-architect.md`
- `prompts/planner.md`
- `prompts/developer-tester.md`
- `prompts/quality.md`

This lets us move the repeated rules out of persona classes:

- read `AGENTS.md` if present
- read `WORKFLOW.md` if present where applicable
- use the JSON action protocol
- do not do ad hoc git persistence
- verify remote branch state before completion

The persona-specific markdown should contain only the behavior unique to that role.

## Runtime Model

TypeScript should still own behavior and interfaces, but prompt/config loading should be data-driven.

Proposed runtime split:

- `src/bots/bot_config.ts`
  - loads and validates `bots.json`
  - resolves defaults
  - validates provider/model values
  - validates referenced prompt files exist
- `src/bots/prompt_loader.ts`
  - reads prompt markdown files
  - concatenates them deterministically
  - logs prompt file list and final prompt hash
- `src/bots/bot_registry.ts`
  - resolves bot id -> loaded config + compiled prompt
- existing persona classes
  - keep task-specific entrypoints only where behavior genuinely differs
  - stop owning long `SYSTEM_INSTRUCTION` strings

In other words:

- code decides which persona receives a task
- data decides who the persona is and what baseline instructions it has

## Dispatcher Changes

The dispatcher should stop instantiating personas with hardcoded prompt strings, and it should stop synthesizing persona-specific task messages.

Instead:

1. Load `bots.json` once at startup.
2. Compile persona prompts from markdown.
3. Select the persona based on routing/state.
4. Pass the triggering GitHub issue/comment body directly as the dynamic task input.

The effective prompt for a run should be:

- static persona prompt from markdown files
- plus the triggering GitHub message body

There may still be a minimal generic wrapper added by code for transport purposes, but it should be the same for every persona and should not contain persona-specific task shaping.

The persona classes should become thinner. For example, `DeveloperTesterPersona` may still own:

- persistence hook wiring
- max iteration budget
- any strictly persona-specific runtime behavior

But it should no longer own:

- a large inline role prompt
- a custom initial-message template
- task shaping logic that duplicates Overseer delegation content

## Dynamic Task Model

The GitHub issue/comment text should be the canonical source of dynamic task information.

That means:

- Overseer must put the real task packet into its delegation comment
- the delegated persona receives that comment body directly
- the dispatcher does not reinterpret that task into a second developer-specific prompt

For example, if Overseer delegates to `@developer-tester`, the issue comment should contain:

- task id
- branch expectation
- files to read first
- plan file path
- concise task summary
- any constraints or guardrails

Then the Developer/Tester runtime should simply consume:

- compiled persona prompt
- plus that comment body

This makes the system easier to reason about because the answer to "what did we tell the bot?" becomes:

- the prompt files listed in `bots.json`
- the exact GitHub comment that delegated the task

There is no hidden second layer of task rewriting in code.

## Delegation Contract

Overseer delegation comments become more important in this design. They are no longer just human-readable summaries; they are the machine-consumed task payload for the next bot.

So Overseer should be responsible for producing a structured delegation comment format that includes the necessary fields for the target persona.

For `@developer-tester`, that likely means a comment block containing:

- task id
- plan file
- files to read
- task summary
- branch expectation

The same principle should apply to other personas: the dynamic assignment belongs in the issue comment, not in a persona-specific TypeScript template.

## Context Refactor

This refactor should also narrow what is sent as dynamic input.

Current pattern:

- large mixed context dumps
- repeated historical comments
- prompt content and task content blurred together
- code-generated task wrappers that partially restate the assignment

Target pattern:

- persona prompt supplies durable standing instructions
- delegation comment supplies the current assignment
- referenced files supply deeper context
- no large unstructured issue transcript unless the transcript itself is the task

## Why Prompt Files Matter

This structure makes it much easier to improve the bots:

- prompt review becomes a normal markdown/code-review exercise
- shared prompt changes can be made once
- persona differences are explicit
- prompt regressions are easier to diff
- configuration can be inspected from workflow artifacts or the repo without reading TypeScript

It also makes it easier to answer "what did we tell this bot?" because the answer becomes:

- bot config entry
- ordered prompt file list
- exact delegation or triggering comment

## Observability Requirements

The refactor should log:

- selected bot id
- selected provider/model
- ordered prompt file list
- final concatenated prompt hash
- triggering comment hash
- triggering comment source URL

Optionally, the trace artifact can also record the exact prompt file paths used for a run.

## Validation Rules

`bots.json` loading should fail closed on:

- unknown bot ids
- missing prompt files
- empty `prompt_files`
- duplicate bot ids
- invalid provider/model config

That prevents silent fallback to the wrong persona prompt.

## Migration Plan

### Phase 1

- Add `bots.json`
- Add prompt markdown files
- Add config loader and prompt loader
- Keep existing persona classes, but inject loaded prompts into them
- Pass the triggering issue/comment body through directly as the dynamic task input
- Keep behavior unchanged

### Phase 2

- Remove inline `SYSTEM_INSTRUCTION` strings from persona classes
- Centralize repeated rules into shared prompt markdown
- Remove persona-specific initial-message construction from code
- Make Overseer delegation comments the canonical task packet

### Phase 3

- Tighten task messages so personas receive less generic issue context
- Ensure Overseer handoffs use a structured delegation format with referenced files and task ids
- Add tests asserting prompt file composition per persona

## Open Questions

- Whether `bots.json` should also own per-persona iteration limits.
- Whether `bots.json` should allow provider-specific options beyond provider/model.
- Whether `prompt_files` should allow optional includes based on runtime context, or remain strictly static.
- Whether the generic dispatcher wrapper should include issue metadata fields in plain text, or whether the raw comment body alone is sufficient.

## Recommendation

Proceed with the refactor in the smallest useful slice:

1. introduce `bots.json`
2. move persona prompts into markdown files
3. load and inject prompts at runtime
4. pass the triggering comment body directly to the selected persona
5. leave the dispatcher state machine and execution mechanics alone

That gets the prompt surface and task packet model under control first. Once prompt identity and delegation content are both explicit and reviewable, the remaining behavior problems should be much easier to debug.
