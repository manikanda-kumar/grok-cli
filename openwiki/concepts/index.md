# Files

- [Modes, model routing & web compatibility](modes-and-routing.md) - How grok-cli maps each mode to a pipeline — model aliases per quality/economy profile, per-mode API call counts, OpenRouter web-tool grounding rules (modeAllowsWeb, resolveWebOptions precedence, assertWebToolsCompatible), and the research→deepresearch deprecation.
- [Web search & OpenRouter server tools](web-search.md) - How grok-cli grounds answers through OpenRouter server tools — resolveWebOptions and validateWebOptions gating, buildTools parameter mapping (excluded_domains vs blocked_domains per tool), engine and max-results/fetch defaults, prompt-token and cost overhead, the json_object-plus-tools incompatibility rule, and the retrieve-mode search force.
