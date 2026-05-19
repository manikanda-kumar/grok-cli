import type { UsageCall, UsageSummary } from "./types.js";

export function emptyUsage(): UsageSummary {
  return {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    calls: [],
  };
}

export function addUsageCall(summary: UsageSummary, call: UsageCall): UsageSummary {
  const calls = [...summary.calls, call];
  const allCostsKnown = calls.every((item) => item.costUsd !== undefined);
  const next: UsageSummary = {
    totalPromptTokens: summary.totalPromptTokens + call.promptTokens,
    totalCompletionTokens: summary.totalCompletionTokens + call.completionTokens,
    calls,
  };

  if (allCostsKnown) {
    next.costUsd = calls.reduce((total, item) => total + (item.costUsd ?? 0), 0);
  }

  return next;
}

export function mergeUsage(summaries: UsageSummary[]): UsageSummary {
  return summaries.reduce((merged, summary) => {
    return summary.calls.reduce((next, call) => addUsageCall(next, call), merged);
  }, emptyUsage());
}

export function formatCost(summary: UsageSummary): string {
  return summary.costUsd === undefined ? "unavailable" : `$${summary.costUsd.toFixed(4)}`;
}
