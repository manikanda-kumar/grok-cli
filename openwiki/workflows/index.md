# Files

- [Multi-agent ensemble workflow (multi mode)](multi-agent.md) - How grok-cli's multi mode runs a 5-call ensemble — a Sonar research pass, three Grok role analyses (engineering, product, skeptic), and a Grok synthesis — including parallel versus sequential leg dispatch under --max-cost, budget-abort and role-failure semantics, and sources/warnings/usage merging in runMulti.
- [Retrieval workflow (Tavily-style results)](retrieval.md) - How retrieve mode, --retrieve, and --output results|both produce search_results[] — the buildRetrieveMessages JSON contract, parseRetrieveContent tolerance, resultsFromSources and mergeRetrieveResults scoring, the optional --output both synthesis pass, and the ignored-retrieve warning on deepresearch/multi.
