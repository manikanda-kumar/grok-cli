---
name: grok-research
description: Web-grounded research via grok-research CLI (OpenRouter Grok + Sonar), with optional native X signal via /whathappened (Grok Build X tools). Use for decision briefs, tradeoffs, cited facts, real-time signal, X/Twitter-grounded answers, multi-perspective synthesis. Triggers - "grok this", "ask grok", "x grounded", "research via grok", "deep research", "decision brief", "deepresearch", "with X signal".
---

# grok-research

CLI: `grok-research` (repo `/Users/manik/Github/grok-cli`, linked as `grok-research`). OpenRouter web search is **server-side**. Native X uses **Grok Build tools** through the installed **whathappened** skill — not `XAI_API_KEY`, not domain-filtered web.

## Prereq

- `OPENROUTER_API_KEY` for web/Sonar legs (env or `~/.config/grok-cli/config.json`).
- For X: Grok Build session with `x_keyword_search` / `x_semantic_search` / `x_thread_fetch` / `x_user_search`, and skill `whathappened` installed (`~/.grok/skills/whathappened`).

## Two ways to get X signal

| Context | How |
|---------|-----|
| **Already inside Grok Build** (this chat) | **Preferred:** run `/whathappened {topic}` (or follow that skill), then consolidate with web via CLI. **Do not** nest `grok-research --x` (spawns another agent). |
| **Outside Grok** (shell, other harness) | `grok-research --x "..."` shells `grok -p` → `/whathappened`, then consolidates with OpenRouter web. |

## Modes (web / Sonar)

| Mode | Pipeline | Web grounding |
|------|----------|---------------|
| `auto` (default) | 1× Grok expert | OpenRouter web **on** |
| `fast` | 1× Grok `grok-4.3` | web **on** |
| `expert` | 1× Grok `grok-4.20` | web **on** |
| `deepresearch` | 1× Sonar deep | Sonar-native |
| `multi` | Sonar + 3× Grok roles + synthesis | Sonar only on research leg |
| `retrieve` | Tavily-style `results[]` | web forced on |

## X flags (CLI)

| Flag | Effect |
|------|--------|
| `--x` | Run Grok agent `/whathappened`, inject X markdown into research, emit `x_signal` in `--json` |
| `--x-only` | X brief only (no OpenRouter) |
| `--x-network off\|prefer\|strict` | whathappened network filter (default `off`) |
| `--x-timeout <sec>` | Agent timeout (default 180) |
| `--x-max-turns <n>` | Agent turns (default 30) |

Env: `GROK_BIN` overrides grok path. Nested spawn blocked when `GROK_RESEARCH_X_ACTIVE=1`.

## In-session hybrid (Grok Build) — preferred for X+web

When the user wants **decision/research + what X is saying**:

### Step 1 — X (native tools)

1. Require a **named topic** (person, product, launch, event).
2. Run **`/whathappened {topic}`** (or execute that skill end-to-end: pulse → lattice → thread fetch → HTML).
3. Keep: short TL;DR, window/mode/confidence, HTML report path, receipts (handles + URLs), camps, gaps.
4. Optional: network only if user asked for follows/list.

If X tools missing: say so; do not fake X from web.

### Step 2 — Web research (CLI)

```bash
grok-research expert --json "<original question>"
# or deepresearch / multi as mode rules dictate
```

Do **not** pass `--x` here (already have X from step 1).

### Step 3 — Consolidate

Produce one **Decision Brief** (or answer the user’s format) that:

1. Uses web/docs for facts, versions, tradeoffs.
2. Uses X sample for reception, sentiment, controversy, first-party launch chatter.
3. Includes **## X signal** (camps + 3–8 receipts with real links).
4. Labels opinion as **public conversation sample**, not ground truth.
5. Points to the whathappened HTML path when present.
6. Lists **Gaps** if X sample thin or web thin.

Do not invent posts or URLs. Prefer `@handle` + `https://x.com/.../status/...`.

### Compact injection alternative

If you already hold X markdown from step 1:

```bash
grok-research expert --no-web --json "$(cat <<'EOF'
<user question>

## Live X/Twitter sample (from /whathappened)
<paste X TL;DR + receipts + camps>
EOF
)"
```

(Or keep web on and still inject the sample in the prompt.)

## Outside Grok — CLI consolidation

```bash
grok-research expert --x "Should we adopt Bun 1.2?"
grok-research --x-only "What is X saying about Composer 2.5?"
grok-research expert --x --x-network prefer --json "Launch reception for Grok 4.20"
```

`--json` includes `x_signal: { markdown, report_path, session_id, cost_usd, warnings }`.

## Mode selection rules

- Decision / tradeoffs → `auto` / `expert` / `fast`
- Deep factual citations → `deepresearch` (Sonar)
- **X opinion / “what happened on X” only** → `/whathappened` or `grok-research --x-only` (not domain allowlist)
- **Decision + social signal** → in-session hybrid above, or `grok-research --x`
- Multi-perspective → `multi` (can combine with in-session X inject)
- Static / no-internet → `--no-web`
- Structured parsing → `--json`

## Anti-patterns

- **Do not** treat `--web-allowed-domains x.com,twitter.com` as real X firehose (weak web-index proxy).
- **Do not** nest `grok-research --x` inside a Grok session that already has X tools.
- **Do not** invent X posts when tools fail — state Gaps.

## Web flags (Grok modes)

| Flag | Effect |
|------|--------|
| `--no-web` | Disable OpenRouter web this run |
| `--web-fetch` | Also `openrouter:web_fetch` |
| `--web-engine` / caps / domain lists | As before |

## Output

- Default → Markdown decision brief (+ `## X signal` when X provided; `## X report` path when HTML exists)
- `--report` / `--raw` / `--json` as before
- `--json` + `--x` → `x_signal` object

## Cost notes

- Web tools add ~1.8k prompt overhead even with 0 searches.
- `--x` adds a full Grok agent session (X tool turns + subscription/agent cost) **before** OpenRouter spend.
- Footer: OpenRouter cost only; agent X cost may appear in `x_signal.cost_usd` when Grok reports it.

## Errors

- Missing `OPENROUTER_API_KEY` → export key (unless `--x-only`).
- `--x` but no `grok` / not authed / no X tools → error with install/auth hint; fall back to in-session `/whathappened` if you are already in Grok Build.
- Nested `--x` → refused (`GROK_RESEARCH_X_ACTIVE`).

## Config

`~/.config/grok-cli/config.json` for models/web defaults. Don't edit without asking.
