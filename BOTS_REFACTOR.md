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
  - keep task-specific entrypoints and initial-message construction
  - stop owning long `SYSTEM_INSTRUCTION` strings

In other words:

- code decides what task a persona receives
- data decides who the persona is and what baseline instructions it has

## Dispatcher Changes

The dispatcher should stop instantiating personas with hardcoded prompt strings.

Instead:

1. Load `bots.json` once at startup.
2. Compile persona prompts from markdown.
3. Pass the compiled prompt into the persona implementation.

The persona classes should become thinner. For example, `DeveloperTesterPersona` should still own:

- task-specific initial message construction
- persistence hook wiring
- max iteration budget

But it should no longer own the large role prompt inline.

## Context Refactor

This refactor should also narrow what is sent in the initial task message.

Current pattern:

- large mixed context dumps
- repeated historical comments
- prompt content and task content blurred together

Target pattern:

- persona prompt supplies durable standing instructions
- initial message supplies the current assignment only
- referenced files supply deeper context

For example, the Developer/Tester initial message should mainly contain:

- the directed task block
- issue branch target
- explicit files to read first
- any plan file path or task id

It should not include a large unstructured issue transcript unless that transcript is the task.

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
- task-specific initial message

## Observability Requirements

The refactor should log:

- selected bot id
- selected provider/model
- ordered prompt file list
- final concatenated prompt hash
- task-specific initial message hash

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
- Keep behavior unchanged

### Phase 2

- Remove inline `SYSTEM_INSTRUCTION` strings from persona classes
- Centralize repeated rules into shared prompt markdown
- Keep only task-specific initial-message construction in code

### Phase 3

- Tighten task messages so personas receive less generic issue context
- Ensure Overseer handoffs reference files and task ids instead of prose summaries
- Add tests asserting prompt file composition per persona

## Open Questions

- Whether `bots.json` should also own per-persona iteration limits.
- Whether `bots.json` should allow provider-specific options beyond provider/model.
- Whether `prompt_files` should allow optional includes based on runtime context, or remain strictly static.

## Recommendation

Proceed with the refactor in the smallest useful slice:

1. introduce `bots.json`
2. move persona prompts into markdown files
3. load and inject prompts at runtime
4. leave the dispatcher state machine and persona task wiring alone

That gets the prompt surface under control first. Once prompt identity and composition are visible and stable, we can then simplify the task-message context separately without mixing both changes together.
