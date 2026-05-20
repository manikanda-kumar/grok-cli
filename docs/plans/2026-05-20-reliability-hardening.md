# Reliability & Cost-Control Hardening Plan

> Captures work added **after** the original build + web-search plans. Neither prior
> plan covers retries, cost limits, or progress output. This is the canonical record.

**Goal:** Make `grok` robust against transient API failures, give agents a cost
guardrail, and surface pipeline progress — without changing default output.

**References:**
- `docs/plans/2026-05-19-grok-cli-implementation-plan.md` (base build)
- `docs/plans/2026-05-19-web-search-integration.md` (web tools)

---

## Features

| Feature | Surface | State |
|---------|---------|-------|
| Retry w/ exponential backoff | `src/openrouter.ts` | Done |
| Honor `Retry-After` header (429) | `src/openrouter.ts` | Done |
| Friendly invalid-JSON error | `src/openrouter.ts` | Done |
| `--max-cost <usd>` guard | `src/args.ts`, `src/cli.ts`, `src/modes.ts`, `src/types.ts` | Done (preventive) |
| stderr step progress | `src/modes.ts` | Done |

---

## Done

- [x] Retry loop: 3 attempts; retry on `429` and `>=500`, and on network `TypeError`.
- [x] `isRetryableError(status)` = `429 || status >= 500`.
- [x] Backoff `2^attempt * 1000ms`; `Retry-After` (seconds) wins when larger (`retryDelay`).
- [x] `sleep()` / `retryDelay()` helpers; `retry-after` read via optional chaining (mock-safe).
- [x] Invalid `response.json()` → `OpenRouterError("...invalid JSON response. Please retry.")`
      (restored after retry refactor dropped it).
- [x] `--max-cost`: parse (`>0`, finite) in `args.ts`; `CliOptions.maxCost?`.
- [x] **Preventive enforcement** via `withBudget()` wrapper in `modes.ts`: accumulates
      per-call `costUsd`; pre-check skips the next call and post-check throws
      `MaxCostExceededError` the moment cumulative spend crosses the cap. For `multi`,
      a budget abort in a parallel analysis leg is rethrown (not demoted to a warning),
      and synthesis is skipped. cli.ts warns when `costUsd` is unknown (cannot enforce).
- [x] Progress to stderr, gated on `!options.json`: single-call `Step 1/1`,
      multi `Step 1/3..3/3`.
- [x] Tests: retry on network / transient / fail-after-3 / Retry-After / invalid-JSON;
      `--max-cost` parse. `exactOptionalPropertyTypes` clean (omit optional keys, never `web: undefined`).

---

## Gaps / follow-ups

- [x] **`--max-cost` + `multi` parallel overspend (Codex high).** Fixed: when `maxCost` is set,
      `multi` analysis legs run **sequentially** (`runSequential`), so the budget pre-check
      stops dispatching the instant the cap is crossed. Worst case bills only the leg that
      detects the overrun (can't know a call's cost without making it); subsequent legs +
      synthesis are never sent. Without `--max-cost`, legs stay parallel for latency.
      Test asserts only `[research, engineering]` dispatched under a cap that trips at leg 1.
- [ ] Retry has **no jitter** — thundering-herd risk under shared rate limits. Add `±20%`.
- [ ] Progress lines print in `--raw` too (only `--json` gated). Confirm desired; consider a
      `--quiet` flag if noisy for piped raw use.
- [ ] README: document `--max-cost`, retry behavior, and `Retry-After` handling
      (HELP_TEXT line exists; README does not).
- [ ] Retries fire on **non-idempotent POST** — acceptable for chat completions (no
      side-effects) but note it; do not extend the retry helper to mutating endpoints.

---

## Verification

```bash
pnpm typecheck   # clean
pnpm test        # 69+ pass, no unhandled rejections
pnpm build       # ok
```
