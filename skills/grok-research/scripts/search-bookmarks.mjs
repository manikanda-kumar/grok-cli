#!/usr/bin/env node
/**
 * Orb-safe TweetSmash bookmark search. Zero deps. No grok-cli, no ft, no Grok Build.
 *
 *   node scripts/search-bookmarks.mjs "agent skills"
 *   node scripts/search-bookmarks.mjs "agent skills" --related --json
 */

const BASE_URL = "https://api.tweetsmash.com/v1";
const USER_AGENT = "grok-research-skill/0.1 (+amp-orb)";
const ENV_KEYS = ["TWEETSMASH_API_KEY", "TWEETSMASH_KEY", "TWEETSMASH", "TWEETSMASH_TOKEN"];

function apiKey() {
  for (const name of ENV_KEYS) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function parseArgs(argv) {
  const out = { query: "", related: false, json: false, limit: 8, relatedLimit: 3, author: undefined, tag: undefined };
  const parts = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--related") out.related = true;
    else if (token === "--json") out.json = true;
    else if (token === "--limit") out.limit = Number.parseInt(argv[++i] ?? "", 10);
    else if (token === "--related-limit") out.relatedLimit = Number.parseInt(argv[++i] ?? "", 10);
    else if (token === "--author") out.author = (argv[++i] ?? "").replace(/^@/, "");
    else if (token === "--tag") out.tag = argv[++i];
    else if (token === "--") parts.push(...argv.slice(i + 1));
    else if (token.startsWith("-")) throw new Error(`Unknown option: ${token}`);
    else parts.push(token);
  }
  out.query = parts.join(" ").trim();
  if (!out.query) throw new Error("Missing search query");
  if (!Number.isFinite(out.limit) || out.limit < 1) throw new Error("Invalid --limit");
  return out;
}

function compact(text, limit = 400) {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length <= limit ? cleaned : `${cleaned.slice(0, limit - 1)}…`;
}

function authorOf(post) {
  return post.author_username || post.author_details?.username || "";
}

function mapPost(post) {
  const postId = post.post_id?.trim();
  if (!postId) return null;
  const author = authorOf(post);
  const link = post.tweet_details?.link?.trim() || `https://x.com/${author || "i"}/status/${postId}`;
  return {
    postId,
    url: link,
    text: compact(post.tweet_details?.text) || `(tweet ${postId})`,
    author,
    authorName: post.author_details?.name,
    postedAt: post.tweet_details?.posted_at ?? null,
    tags: Array.isArray(post.tags) ? post.tags.filter(Boolean) : [],
  };
}

async function requestBookmarks(token, params) {
  const url = new URL(`${BASE_URL}/bookmarks`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  const body = await response.text();
  if (response.status === 429) throw new Error("TweetSmash rate limited (100 req/hour).");
  if (response.status === 401 || response.status === 403) throw new Error("TweetSmash unauthorized. Check TWEETSMASH_API_KEY.");
  if (!response.ok) throw new Error(`TweetSmash HTTP ${response.status}: ${body.slice(0, 200)}`);
  const payload = JSON.parse(body);
  if (!payload.status || !Array.isArray(payload.data)) throw new Error(payload.message || "Unexpected TweetSmash payload");
  return payload.data.map(mapPost).filter(Boolean);
}

function relatedTerms(query, hits) {
  const terms = [];
  const seen = new Set();
  const add = (term) => {
    const cleaned = String(term ?? "").trim().replace(/^@/, "");
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key) || key === query.trim().toLowerCase()) return;
    seen.add(key);
    terms.push(cleaned);
  };
  for (const hit of hits) {
    add(hit.author);
    for (const tag of hit.tags) add(tag);
  }
  for (const word of query.replace(/[/:,]/g, " ").split(/\s+/).filter((part) => part.length > 3).slice(0, 3)) add(word);
  return terms.slice(0, 6);
}

function render(result) {
  const lines = [`## Saved X bookmarks · ${result.query}`];
  if (result.hits.length === 0) lines.push("No keyword/semantic hits in the TweetSmash library.");
  for (const hit of result.hits) {
    lines.push(`- @${hit.author || "unknown"} — ${hit.text}`);
    lines.push(`  ${hit.url}`);
  }
  const related = result.related.filter((group) => group.hits.length > 0);
  if (related.length) {
    lines.push("", "## Related saves");
    for (const group of related) {
      lines.push(`### ${group.via} \`${group.term}\``);
      for (const hit of group.hits) {
        lines.push(`- @${hit.author || "unknown"} — ${hit.text}`);
        lines.push(`  ${hit.url}`);
      }
    }
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = apiKey();
  if (!token) {
    const payload = { query: args.query, skipped: true, reason: "no-api-key", hits: [], related: [] };
    if (args.json) console.log(JSON.stringify(payload, null, 2));
    else console.log("TweetSmash token missing. Set TWEETSMASH_API_KEY (Amp personal secret for orbs).");
    process.exitCode = 2;
    return;
  }

  const hits = await requestBookmarks(token, {
    limit: Math.min(args.limit, 20),
    q: args.query,
    vector_search_term: args.query,
    author: args.author,
    tag: args.tag,
  });
  const related = [];
  if (args.related && hits.length) {
    const seen = new Set(hits.map((hit) => hit.postId));
    const authors = new Set(hits.map((hit) => hit.author?.toLowerCase()).filter(Boolean));
    const tags = new Set(hits.flatMap((hit) => hit.tags.map((tag) => tag.toLowerCase())));
    for (const term of relatedTerms(args.query, hits)) {
      const params = { limit: args.relatedLimit };
      let via = "term";
      if (authors.has(term.toLowerCase())) {
        via = "author";
        params.author = term;
      } else if (tags.has(term.toLowerCase())) {
        via = "tag";
        params.tag = term;
      } else {
        params.q = term;
        params.vector_search_term = term;
      }
      const extras = [];
      for (const hit of await requestBookmarks(token, params)) {
        if (seen.has(hit.postId)) continue;
        if (via === "author" && hit.author?.toLowerCase() !== term.toLowerCase()) continue;
        seen.add(hit.postId);
        extras.push(hit);
      }
      related.push({ term, via, hits: extras });
    }
  }

  const result = { query: args.query, skipped: false, hits, related };
  console.log(args.json ? JSON.stringify(result, null, 2) : render(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
