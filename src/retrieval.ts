import { extractSources } from "./openrouter.js";
import type { SearchResult, Source } from "./types.js";

// Re-export so retrieval tests and callers can import from one place.
export { extractSources };

// Parses the JSON object the model emits in retrieve mode. The model is
// instructed to return { results: [{title,url,content}], answer?: string }.
// Any malformed payload yields an empty results array rather than throwing,
// so the pipeline can still surface sources and usage.
export interface ParsedRetrievePayload {
  results: SearchResult[];
  answer?: string;
}

export function parseRetrieveContent(content: string): ParsedRetrievePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { results: [] };
  }

  const obj = parsed as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") return { results: [] };

  const rawResults = Array.isArray(obj.results) ? obj.results : [];
  const results: SearchResult[] = rawResults
    .map((item) => toSearchResult(item))
    .filter((item): item is SearchResult => item !== undefined);

  const answer = typeof obj.answer === "string" ? obj.answer : undefined;
  return { results, ...(answer !== undefined ? { answer } : {}) };
}

function toSearchResult(value: unknown): SearchResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : "";
  const title = typeof record.title === "string" ? record.title : "";
  if (!url) return undefined;

  const content = typeof record.content === "string" ? record.content : "";
  const result: SearchResult = { title, url, content };

  if (typeof record.score === "number" && Number.isFinite(record.score)) result.score = record.score;
  if (typeof record.raw_content === "string") result.raw_content = record.raw_content;
  return result;
}

// Builds a Tavily-style results[] from OpenRouter citations + annotations when
// the model did not emit a structured payload (or in --retrieve on a normal
// mode). Sources are scored heuristically by citation order: earlier citations
// are treated as more relevant. Scores span (0, 1].
export function resultsFromSources(sources: Source[]): SearchResult[] {
  const count = sources.length;
  if (count === 0) return [];
  return sources.map((source, index) => ({
    title: source.title ?? "",
    url: source.url,
    content: "",
    score: roundScore(1 - index / count),
  }));
}

// Merges model-emitted results with citation-derived sources so URLs that only
// appear as annotations are still represented. Model results take precedence
// (they carry snippets); citation-only entries get empty content.
export function mergeRetrieveResults(parsed: ParsedRetrievePayload, sources: Source[]): SearchResult[] {
  const byUrl = new Map<string, SearchResult>();
  for (const result of parsed.results) byUrl.set(result.url, result);
  for (const source of sources) {
    if (byUrl.has(source.url)) continue;
    byUrl.set(source.url, {
      title: source.title ?? "",
      url: source.url,
      content: "",
    });
  }
  // Score any results that lack a score, preserving citation order.
  const ordered = [...byUrl.values()];
  const total = ordered.length;
  return ordered.map((result, index) =>
    result.score !== undefined ? result : { ...result, score: roundScore(1 - index / Math.max(total, 1)) },
  );
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
