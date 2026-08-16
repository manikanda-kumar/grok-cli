import { describe, expect, it } from "vitest";
import {
  formatBookmarksMarkdown,
  mapPost,
  relatedTerms,
  searchBookmarks,
  tweetsmashApiKey,
  type TweetsmashPost,
} from "../src/bookmarks.js";

function post(overrides: Partial<TweetsmashPost> = {}): TweetsmashPost {
  return {
    post_id: "1",
    author_username: "matteocollina",
    author_details: { name: "Matteo", username: "matteocollina" },
    tweet_details: {
      text: "Skills follow the Agent Skills open standard.",
      link: "https://twitter.com/matteocollina/status/1",
      posted_at: "2026-01-01T00:00:00Z",
    },
    tags: [],
    ...overrides,
  };
}

describe("tweetsmashApiKey", () => {
  it("prefers TWEETSMASH_API_KEY then fallbacks", () => {
    expect(tweetsmashApiKey({ TWEETSMASH_API_KEY: " a ", TWEETSMASH: "b" })).toBe("a");
    expect(tweetsmashApiKey({ TWEETSMASH_TOKEN: "tok" })).toBe("tok");
    expect(tweetsmashApiKey({})).toBeUndefined();
  });
});

describe("mapPost / relatedTerms", () => {
  it("maps a TweetSmash post and derives related authors/terms", () => {
    const hit = mapPost(post({ tags: ["AI"] }));
    expect(hit).toMatchObject({
      postId: "1",
      author: "matteocollina",
      url: "https://twitter.com/matteocollina/status/1",
      tags: ["AI"],
    });
    expect(relatedTerms("agent skills", [hit!])).toEqual(["matteocollina", "AI", "agent", "skills"]);
  });
});

describe("searchBookmarks", () => {
  it("skips when no API key is present", async () => {
    const result = await searchBookmarks({ query: "skills", env: {}, apiKey: null });
    expect(result).toMatchObject({ skipped: true, reason: "no-api-key", hits: [] });
  });

  it("sends keyword + semantic params and maps hits", async () => {
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input);
      expect(url).toContain("q=agent+skills");
      expect(url).toContain("vector_search_term=agent+skills");
      return new Response(JSON.stringify({ status: true, data: [post()] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const result = await searchBookmarks({
      query: "agent skills",
      apiKey: "tok",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.skipped).toBe(false);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.author).toBe("matteocollina");
  });

  it("related author queries use author= not q=", async () => {
    const urls: string[] = [];
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input);
      urls.push(url);
      const data = url.includes("author=")
        ? [post({ post_id: "2", tweet_details: { text: "Are your agents production ready?", link: "https://x.com/matteocollina/status/2" } })]
        : [post()];
      return new Response(JSON.stringify({ status: true, data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const result = await searchBookmarks({
      query: "agent skills",
      related: true,
      apiKey: "tok",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(urls.some((url) => url.includes("author=matteocollina"))).toBe(true);
    expect(result.related.some((group) => group.via === "author" && group.hits[0]?.postId === "2")).toBe(true);
  });
});

describe("formatBookmarksMarkdown", () => {
  it("renders hits and related groups", () => {
    const markdown = formatBookmarksMarkdown({
      query: "skills",
      skipped: false,
      hits: [
        {
          postId: "1",
          url: "https://x.com/a/status/1",
          text: "hello",
          author: "a",
          tags: [],
        },
      ],
      related: [
        {
          term: "a",
          via: "author",
          hits: [{ postId: "2", url: "https://x.com/a/status/2", text: "more", author: "a", tags: [] }],
        },
      ],
    });
    expect(markdown).toContain("## Saved X bookmarks · skills");
    expect(markdown).toContain("@a — hello");
    expect(markdown).toContain("## Related saves");
    expect(markdown).toContain("author `a`");
  });
});
