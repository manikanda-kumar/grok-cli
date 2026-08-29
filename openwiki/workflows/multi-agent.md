---
type: workflow
title: Multi-agent ensemble workflow (multi mode)
description: How grok-cli's multi mode runs a 5-call ensemble — a Sonar research pass, three Grok role analyses (engineering, product, skeptic), and a Grok synthesis — including parallel versus sequential leg dispatch under --max-cost, budget-abort and role-failure semantics, and sources/warnings/usage merging in runMulti.
tags: [workflow, multi-agent, ensemble, sonar, grok-roles, synthesis, max-cost, partial-failure]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-29T08:01:17.972Z
sources:
  - id: openwiki-source-d5eb14827168c0507b57a726
    resource: repo://src/args.ts
  - id: openwiki-source-d2f650c01f560a60ae9115b9
    resource: repo://src/cli.ts
  - id: openwiki-source-2b68006c6421e01c95988dcc
    resource: repo://src/config.ts
  - id: openwiki-source-c841b3e5e517a94d46ac2ddc
    resource: repo://src/cost.ts
  - id: openwiki-source-e425c4159594728f0491dc9f
    resource: repo://src/defaults.ts
  - id: openwiki-source-75e054fe46c678f8d07f2214
    resource: repo://src/modes.ts
  - id: openwiki-source-052041e1d130beaefa6b730d
    resource: repo://src/prompts.ts
  - id: openwiki-source-353c174bc6cb3fd8d0af9849
    resource: repo://test/modes.test.ts
generated: { by: "openwiki/0.4.3", at: "2026-08-29T08:01:17.972Z" }
---

# Multi-agent ensemble workflow (multi mode)

`multi` is grok-cli's **multi-perspective ensemble** mode: one prompt fans out into
**5 model calls** — a Sonar grounded-facts research pass, three Grok role analyses
(`engineering`, `product`, `skeptic`), and one Grok synthesis — so the final answer
is a reconciled brief rather than a single model's take. It is the mode to choose
for opposing-perspective technology and product decisions ("Redis or Memcached for
session cache only"), and it is the pipeline where `--max-cost` behavior matters
most, because it is the only branch that dispatches concurrent billable legs.

## Position in the pipeline

`runMode` (in `src/modes.ts`) dispatches in strict priority order
**schema → multi → retrieve → deepresearch → single Grok call**. After the
`--schema` branch (which takes over the single-call path even for `multi`), the
`options.mode === "multi"` check is next, so the ensemble cannot be pre-empted by
retrieve or the single-call tail (`src/modes.ts#L199-L205`). `multi` is a
**non-web mode**: `modeAllowsWeb("multi")` returns false, so `resolveWebOptions`
short-circuits and no leg — including the Grok legs — ever attaches OpenRouter
server tools; the Sonar research pass does its own native search server-side.
Passing `--retrieve` / `--output results` / `--output both` to `multi` is ignored
with the warning `--retrieve/--output was ignored in <mode> mode; this mode does
not use OpenRouter web tools.` (`src/modes.ts#L209-L223`, `test/modes.test.ts#L555-L581`).

Model alias resolution pins the ensemble to two aliases (`src/modes.ts#L558-L559`):

| Call | Alias (quality → economy) | Role |
|---|---|---|
| Research pass | `research` → `perplexity/sonar-reasoning-pro` → `perplexity/sonar-pro` | `research` |
| Role analyses (×3) | `expert` → `x-ai/grok-4.20` → `x-ai/grok-4.3` | `engineering`, `product`, `skeptic` |
| Synthesis | `expert` alias (same as analyses) | `synthesis` |

The unused `nativeMulti` alias (`x-ai/grok-4.20-multi-agent`) is deliberately not
used: `multi` fans out to three plain single calls, not a native multi-agent model.

## The 5-call flow

```mermaid
sequenceDiagram
    autonumber
    participant M as runMulti
    participant S as Sonar research pass
    participant G1 as Grok engineering role
    participant G2 as Grok product role
    participant G3 as Grok skeptic role
    participant G4 as Grok synthesis
    M->>S: research call, role research, buildResearchMessages report, temperature 0.1, no web tools
    S-->>M: grounded facts + sources
    M->>G1: buildRoleAnalysisMessages engineering
    M->>G2: buildRoleAnalysisMessages product
    M->>G3: buildRoleAnalysisMessages skeptic
    G1-->>M: engineering analysis
    G2-->>M: product analysis
    G3-->>M: skeptic analysis
    M->>G4: buildSynthesisMessages with prompt, research, 3 analyses, source URLs, json option
    G4-->>M: final synthesized answer
    M->>M: merge usage, sources, warnings; normalizeResult stamps mode multi
```

Caption: the multi ensemble — Sonar research (no web tools) precedes three parallel
Grok role analyses, all of whose content is handed to a final Grok synthesis.

### Pass 1 — Sonar research (`role: "research"`)

The research call uses `buildResearchMessages(options.prompt, "report", false, xMarkdown, bookmarksMarkdown)`:
a `"report"`-shaped system prompt extended with *"Ground every factual claim in
current sources. Include citations when available."*, temperature **0.1**
(`src/modes.ts#L561-L567`, `src/prompts.ts#L26-L40`). The response's `content`
and `sources` become the factual substrate for every downstream role. A failed
research call fails the whole run — there is nothing to analyze
(`test/modes.test.ts#L348-L355`).

### Pass 2 — three Grok role analyses

Each role gets `buildRoleAnalysisMessages(role, prompt, research.content)`:
a system prompt naming the reviewer plus a role-specific instruction, and a user
message with the original question and the research findings
(`src/prompts.ts#L42-L54`):

- **engineering** — "Analyze engineering feasibility, implementation complexity,
  maintainability, ecosystem maturity, and operational risks."
- **product** — "Analyze user value, business tradeoffs, adoption risk,
  differentiation, and roadmap implications."
- **skeptic** — "Find weak assumptions, missing evidence, hidden costs, security
  risks, and reasons the recommendation may be wrong."

All three fire with the `expert` model and temperature **0.2** (`src/modes.ts#L569-L577`).

### Pass 3 — synthesis

The synthesis call uses `buildSynthesisMessages(prompt, research.content,
analyses.map(a => a.content), outputFormat, research source URLs, options.json,
xMarkdown, bookmarksMarkdown)` — a user message that concatenates the original
question, the grounded research, the source URLs, and the three role analyses
under `Role analyses:`, then instructs *"Synthesize the final answer."*
(`src/modes.ts#L601-L616`, `src/prompts.ts#L56-L80`). The synthesis system prompt
is the standard per-output-format prompt (`brief` / `report` / `raw`, plus the
`--json` DecisionAnswer contract when `options.json` is set) with `webSearch:
false` hard-coded, so X/bookmark instructions are included but web-tool
instructions never are. It runs at temperature **0.2** with `json: options.json`.

## Parallel vs sequential dispatch under --max-cost

The three analysis legs are dispatched according to whether a budget cap is set
(`src/modes.ts#L579-L588`):

```ts
const settled =
  options.maxCost === undefined
    ? await Promise.allSettled(roles.map(runLeg))
    : await runSequential(roles, runLeg);
```

- **Default (no `--max-cost`):** the roles run via `Promise.allSettled` — all three
  in flight concurrently for latency. Per-role failures are collected as settled
  rejections, not thrown.
- **With `--max-cost`:** they run **sequentially** via `runSequential`
  (`src/modes.ts#L70-L84`), a sequential analog of `allSettled` that appends each
  result and **breaks out of the loop the moment a leg throws
  `MaxCostExceededError`** — so the `withBudget` pre-check never fires another
  billable leg after the cap is crossed. Sequential dispatch under a cap is what
  makes `--max-cost` preventive on `multi`; parallel dispatch could not stop legs
  already in flight from overspending.

The test pins the exact dispatch cut: with costs of $0.001/call and a $0.0015 cap,
only `research` then `engineering` are ever called — `product`, `skeptic`, and
`synthesis` are never dispatched (`test/modes.test.ts#L265-L276`).

## Failure semantics

`runMulti` classifies settled outcomes into three tiers:

1. **Budget abort is fatal.** If any leg rejects with `MaxCostExceededError`
   (checked before warning extraction), the reason is **rethrown**: synthesis is
   skipped, the error becomes a stderr `formatError` with exit code 1, and the
   run never produces a result (`src/modes.ts#L586-L588`; the error message pins
   the abort point: `Cost $<spent> exceeded limit of $<limit> (aborted after
   "<role>")` — `src/modes.ts#L43-L48`).
2. **Per-role failures are warnings.** A rejected analysis leg becomes a warning
   line `"<role> analysis failed: <reason>"` via the settled-index mapping, and
   synthesis proceeds with the surviving analyses (`src/modes.ts#L590-L594`,
   `test/modes.test.ts#L315-L333` — a failed `product` leg yields content "Final"
   plus warnings, and `usage.calls` has length 4, not 5).
3. **All roles failed is fatal.** If `analyses.length === 0` the run throws
   `Multi-agent mode failed because all Grok analysis roles failed`
   (`src/modes.ts#L596-L598`, `test/modes.test.ts#L335-L346`). Note a budget
   abort during all-sequential legs already exits via tier 1 before this check.

A failed **research** pass is also fatal (tier 1 style — nothing to analyze),
and `--schema` overrides `multi` entirely with a warning that the ensemble was
replaced by a single schema-constrained Grok call (`src/modes.ts#L147-L152`,
`test/modes.test.ts#L525-L539`).

## Merging in runMulti

The final result is assembled on top of the synthesis result
(`src/modes.ts#L618-L632`):

| Field | Merge rule |
|---|---|
| `content` | synthesis content (the final answer) |
| `mode` / `profile` / `outputFormat` | stamped `"multi"` / `options.profile` / `options.outputFormat` before normalization repeats it |
| `sources` | research sources **plus** synthesis sources (role analyses contribute none) |
| `warnings` | research warnings + role-failure warnings + synthesis warnings |
| `usage` | `mergeUsage([research.usage, ...analyses.map(a => a.usage), synthesis.usage])` — all five calls, in call order |

`mergeUsage` replays every call through `addUsageCall`, so a single aggregate
`costUsd` exists only when **all five** calls reported a cost (`src/cost.ts#L11-L33`)
— when any leg omits cost the aggregate is `undefined`, and a set `--max-cost`
degrades to the cli.ts stderr warning that the limit was not enforced
(`src/cli.ts#L36-L40`). The merged object then goes through `normalizeResult`,
which dedupes warnings, overwrites the client's placeholder `web` with the
mode-correct `{ searchEnabled: false, fetchEnabled: false }` for `multi`, and —
under `--json` with no schema/retrieve/outputStyle — parses the synthesis content
into the `DecisionAnswer` shape (`src/modes.ts#L635-L673`).

Because `multi` never attaches web tools, `--json` in `multi` is a **single-pass**
synthesis call (`json: options.json` on the synthesis call only); the
two-pass `--json`+web pattern does not apply (`src/modes.ts#L615-L616`).

## Operations notes

- **Cost:** 5 calls per run; the stderr progress contract prints
  `Step 1/3: Researching grounded facts...`, `Step 2/3: Analyzing perspectives
  (engineering, product, skeptic)...`, and `Step 3/3: Synthesizing final
  answer...`, all gated on `!options.json` (`src/modes.ts#L561`, `L570`, `L600`).
- **Budget guidance:** the agent tips in `HELP_TEXT` recommend `--max-cost`
  specifically for `multi` because of its 5-call fan-out
  (`src/args.ts#L175`); the sequential-under-cap semantics make the cap
  preventive rather than merely reactive.
- **Signals:** when `--x` / `--bookmarks` run, their rendered markdown is injected
  into the research and synthesis user messages as sample context; after the
  branch completes, `attachContext` attaches `xSignal` / `bookmarks` and folds
  their warnings into the deduped warning list (`src/modes.ts#L199-L205`,
  `src/prompts.ts#L88-L106`).

## Focused tests that pin the ensemble

- `test/modes.test.ts#L233-L255` — the happy path: exactly 5 calls, every call
  carries `web === undefined` (no tools anywhere), content is the synthesis
  output, `usage.calls` has length 5, and `result.web.searchEnabled` is false.
- `test/modes.test.ts#L265-L276` — sequential legs under `--max-cost`: a $0.0015
  cap with $0.001 legs dispatches only `research` and `engineering` before
  throwing, so no further billable leg fires.
- `test/modes.test.ts#L315-L333` — one role failure demotes to a warning line and
  synthesis continues with a 4-call usage.
- `test/modes.test.ts#L335-L346` — all three roles failing throws the
  all-roles-failed error.
- `test/modes.test.ts#L348-L355` — research failure fails the run after exactly
  one call.
- `test/modes.test.ts#L525-L539` — `--schema` overrides `multi` with a warning
  and dispatches a single schema call instead of the 5-call fan-out.
