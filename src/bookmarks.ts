/**
 * Live TweetSmash bookmark overlay.
 *
 * Native REST only — no `ft`, no MCP, no Python. Safe in Amp orbs as long as
 * TWEETSMASH_API_KEY (or TWEETSMASH_KEY / TWEETSMASH / TWEETSMASH_TOKEN) is set.
 *
 * Keyword (`q`) + semantic (`vector_search_term`) on GET /v1/bookmarks.
 * Optional related pass re-queries authors/tags/terms from the first hits.
 */

import type {
  BookmarkHit,
  BookmarkRelatedGroup,
  BookmarkSearchOptions,
  BookmarkSearchResult,
} from "./types.js";

const BASE_URL = "https://api.tweetsmash.com/v1";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_LIMIT = 8;
const DEFAULT_RELATED_LIMIT = 3;
const USER_AGENT = "grok-cli/0.1 (+https://github.com/manikanda-kumar/grok-cli)";
const ENV_KEY_CANDIDATES = ["TWEETSMASH_API_KEY", "TWEETSMASH_KEY", "TWEETSMASH", "TWEETSMASH_TOKEN"] as const;

interface TweetsmashTweetDetails {
  text?: string;
  link?: string;
  posted_at?: string;
}

interface TweetsmashAuthorDetails {
  name?: string;
  username?: string;
}

export interface TweetsmashPost {
  post_id?: string;
  tags?: string[] | null;
  author_username?: string;
  author_details?: TweetsmashAuthorDetails | null;
  tweet_details?: TweetsmashTweetDetails | null;
  imported_at?: string;
  is_read?: boolean;
}

interface TweetsmashSearchResponse {
  status?: boolean;
  data?: TweetsmashPost[];
  message?: string | null;
}

export function tweetsmashApiKey(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string | undefined {
  for (const name of ENV_KEY_CANDIDATES) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export class BookmarkSearchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BookmarkSearchError";
  }
}

function compactText(value: string | undefined | null, limit = 280): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit - 1)}…`;
}

function tagsOf(post: TweetsmashPost): string[] {
  return Array.isArray(post.tags) ? post.tags.filter((tag): tag is string => Boolean(tag)) : [];
}

function authorOf(post: TweetsmashPost): string {
  return post.author_username || post.author_details?.username || "";
}

function statusUrl(post: TweetsmashPost): string {
  const link = post.tweet_details?.link?.trim();
  if (link) return link;
  const handle = authorOf(post) || "i";
  return `https://x.com/${handle}/status/${post.post_id ?? ""}`;
}

export function mapPost(post: TweetsmashPost): BookmarkHit | null {
  const postId = post.post_id?.trim();
  if (!postId) return null;
  const author = authorOf(post);
  return {
    postId,
    url: statusUrl(post),
    text: compactText(post.tweet_details?.text, 400) || `(tweet ${postId})`,
    ...(author ? { author } : {}),
    ...(post.author_details?.name ? { authorName: post.author_details.name } : {}),
    postedAt: post.tweet_details?.posted_at ?? null,
    tags: tagsOf(post),
  };
}

export function relatedTerms(query: string, hits: BookmarkHit[]): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();

  const add = (term: string | undefined) => {
    const cleaned = (term ?? "").trim().replace(/^@/, "");
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key) || key === query.trim().toLowerCase()) return;
    seen.add(key);
    terms.push(cleaned);
  };

  for (const hit of hits) {
    add(hit.author);
    for (const tag of hit.tags) add(tag);
  }
  for (const word of query.replace(/[/:,]/g, " ").split(/\s+/).filter((part) => part.length > 3).slice(0, 3)) {
    add(word);
  }
  return terms.slice(0, 6);
}

function skipped(reason: string): BookmarkSearchResult {
  return { query: "", hits: [], related: [], skipped: true, reason };
}

async function requestBookmarks(
  apiKey: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<TweetsmashPost[]> {
  const url = new URL(`${BASE_URL}/bookmarks`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    if (response.status === 429) throw new BookmarkSearchError("TweetSmash rate limited (100 req/hour).");
    if (response.status === 401 || response.status === 403) {
      throw new BookmarkSearchError("TweetSmash unauthorized. Check TWEETSMASH_API_KEY.");
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BookmarkSearchError(`TweetSmash HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    const payload = (await response.json()) as TweetsmashSearchResponse;
    if (!payload.status || !Array.isArray(payload.data)) {
      throw new BookmarkSearchError(payload.message || "TweetSmash returned an unexpected payload.");
    }
    return payload.data;
  } catch (error) {
    if (error instanceof BookmarkSearchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new BookmarkSearchError(`TweetSmash request timed out after ${timeoutMs}ms.`);
    }
    throw new BookmarkSearchError(`TweetSmash network error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchBookmarks(options: BookmarkSearchOptions): Promise<BookmarkSearchResult> {
  const query = options.query.trim();
  if (!query) return skipped("empty-query");

  const env = options.env ?? process.env;
  const apiKey = options.apiKey === undefined ? tweetsmashApiKey(env) : options.apiKey?.trim() || undefined;
  if (!apiKey) return skipped("no-api-key");

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 20);
  const relatedLimit = Math.min(Math.max(options.relatedLimit ?? DEFAULT_RELATED_LIMIT, 1), 10);

  const params: Record<string, string> = {
    limit: String(limit),
    q: query,
    vector_search_term: query,
  };
  if (options.author) params.author = options.author.replace(/^@/, "");
  if (options.tag) params.tag = options.tag;

  const posts = await requestBookmarks(apiKey, params, fetchImpl, timeoutMs);
  const hits = posts.map(mapPost).filter((hit): hit is BookmarkHit => hit !== null);
  const related: BookmarkRelatedGroup[] = [];

  if (options.related && hits.length > 0) {
    const seen = new Set(hits.map((hit) => hit.postId));
    const hitAuthors = new Set(hits.map((hit) => hit.author?.toLowerCase()).filter((value): value is string => Boolean(value)));
    const hitTags = new Set(hits.flatMap((hit) => hit.tags.map((tag) => tag.toLowerCase())));

    for (const term of relatedTerms(query, hits)) {
      const relatedParams: Record<string, string> = { limit: String(relatedLimit) };
      let via: BookmarkRelatedGroup["via"] = "term";
      if (hitAuthors.has(term.toLowerCase())) {
        via = "author";
        relatedParams.author = term;
      } else if (hitTags.has(term.toLowerCase())) {
        via = "tag";
        relatedParams.tag = term;
      } else {
        relatedParams.q = term;
        relatedParams.vector_search_term = term;
      }

      const relatedPosts = await requestBookmarks(apiKey, relatedParams, fetchImpl, timeoutMs);
      const relatedHits: BookmarkHit[] = [];
      for (const post of relatedPosts) {
        const hit = mapPost(post);
        if (!hit || seen.has(hit.postId)) continue;
        if (via === "author" && hit.author?.toLowerCase() !== term.toLowerCase()) continue;
        seen.add(hit.postId);
        relatedHits.push(hit);
      }
      related.push({ term, via, hits: relatedHits });
    }
  }

  return { query, hits, related, skipped: false };
}

export function formatBookmarksMarkdown(result: BookmarkSearchResult): string {
  if (result.skipped) {
    return result.reason === "no-api-key"
      ? "TweetSmash token missing. Set TWEETSMASH_API_KEY (or TWEETSMASH_KEY / TWEETSMASH / TWEETSMASH_TOKEN)."
      : `TweetSmash search skipped (${result.reason ?? "unknown"}).`;
  }

  const lines = [`## Saved X bookmarks · ${result.query}`];
  if (result.hits.length === 0) {
    lines.push("No keyword/semantic hits in the TweetSmash library.");
  }
  for (const hit of result.hits) {
    const handle = hit.author ? `@${hit.author}` : "(unknown)";
    lines.push(`- ${handle} — ${hit.text}`);
    lines.push(`  ${hit.url}${hit.tags.length ? ` · tags: ${hit.tags.join(", ")}` : ""}`);
  }

  const relatedWithHits = result.related.filter((group) => group.hits.length > 0);
  if (relatedWithHits.length > 0) {
    lines.push("", "## Related saves");
    for (const group of relatedWithHits) {
      lines.push(`### ${group.via} \`${group.term}\``);
      for (const hit of group.hits) {
        const handle = hit.author ? `@${hit.author}` : "(unknown)";
        lines.push(`- ${handle} — ${hit.text}`);
        lines.push(`  ${hit.url}`);
      }
    }
  }
  return lines.join("\n");
}

export async function fetchBookmarkSignal(options: BookmarkSearchOptions): Promise<BookmarkSearchResult> {
  try {
    return await searchBookmarks(options);
  } catch (error) {
    return {
      query: options.query,
      hits: [],
      related: [],
      skipped: true,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
