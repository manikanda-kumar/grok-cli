import type { OutputFormat } from "./types.js";

const WEB_SEARCH_INSTRUCTION =
  "You have access to live web search. Use it for time-sensitive facts, current versions, pricing, or anything that may have changed since training. Cite authoritative sources; include URLs in ## Sources when writing Markdown.";

const RETRIEVE_INSTRUCTION =
  "You have live web search. Run searches to find the most relevant, authoritative results for the query. After searching, return ONLY a JSON object with this exact shape: { \"results\": [ { \"title\": string, \"url\": string, \"content\": string } ], \"answer\": string }. The results array must contain one entry per distinct source you found, ranked by relevance, with a concise snippet (1-3 sentences) in content. The answer field must be a short (2-4 sentence) summary if the query asks for one, otherwise an empty string. Do not include any text outside the JSON. Do not wrap it in Markdown fences.";

export function buildSingleCallMessages(
  prompt: string,
  outputFormat: OutputFormat,
  json = false,
  webSearch = false,
  xSignalMarkdown?: string,
  bookmarksMarkdown?: string,
) {
  return [
    {
      role: "system" as const,
      content: systemPrompt(outputFormat, json, webSearch, Boolean(xSignalMarkdown), Boolean(bookmarksMarkdown)),
    },
    { role: "user" as const, content: withContext(prompt, xSignalMarkdown, bookmarksMarkdown) },
  ];
}

export function buildResearchMessages(
  prompt: string,
  outputFormat: OutputFormat,
  json = false,
  xSignalMarkdown?: string,
  bookmarksMarkdown?: string,
) {
  return [
    {
      role: "system" as const,
      content: `${systemPrompt(outputFormat, json, false, Boolean(xSignalMarkdown), Boolean(bookmarksMarkdown))}\nGround every factual claim in current sources. Include citations when available.`,
    },
    { role: "user" as const, content: withContext(prompt, xSignalMarkdown, bookmarksMarkdown) },
  ];
}

export function buildRoleAnalysisMessages(role: "engineering" | "product" | "skeptic", prompt: string, research: string) {
  const roleInstruction = {
    engineering:
      "Analyze engineering feasibility, implementation complexity, maintainability, ecosystem maturity, and operational risks.",
    product: "Analyze user value, business tradeoffs, adoption risk, differentiation, and roadmap implications.",
    skeptic: "Find weak assumptions, missing evidence, hidden costs, security risks, and reasons the recommendation may be wrong.",
  }[role];

  return [
    { role: "system" as const, content: `You are the ${role} reviewer in a multi-agent research ensemble. ${roleInstruction}` },
    { role: "user" as const, content: `Original question:\n${prompt}\n\nGrounded research findings:\n${research}` },
  ];
}

export function buildSynthesisMessages(
  prompt: string,
  research: string,
  analyses: string[],
  outputFormat: OutputFormat,
  sources: string[] = [],
  json = false,
  xSignalMarkdown?: string,
  bookmarksMarkdown?: string,
) {
  return [
    {
      role: "system" as const,
      content: systemPrompt(outputFormat, json, false, Boolean(xSignalMarkdown), Boolean(bookmarksMarkdown)),
    },
    {
      role: "user" as const,
      content: withContext(
        `Original question:\n${prompt}\n\nGrounded research:\n${research}\n\nSource URLs:\n${sources.join("\n") || "None provided"}\n\nRole analyses:\n${analyses.join("\n\n---\n\n")}\n\nSynthesize the final answer.`,
        xSignalMarkdown,
        bookmarksMarkdown,
      ),
    },
  ];
}

/** Inject live X sample into the user message for consolidation. */
export function withXSignal(prompt: string, xSignalMarkdown?: string): string {
  return withContext(prompt, xSignalMarkdown);
}

/** Inject X public signal and/or the user's TweetSmash bookmarks. */
export function withContext(prompt: string, xSignalMarkdown?: string, bookmarksMarkdown?: string): string {
  const parts = [prompt];
  if (xSignalMarkdown?.trim()) {
    parts.push(`## Live X/Twitter public conversation (from /whathappened via Grok agent native X tools)
Treat this as a sample of public conversation on X — not ground truth and not a substitute for docs, changelogs, or benchmarks.
Prefer web/docs for product facts and versions. Use X for reception, sentiment, controversy, and first-party launch chatter.
When writing the brief, include a short ## X signal section summarizing camps and linking key receipts when relevant.

${xSignalMarkdown.trim()}`);
  }
  if (bookmarksMarkdown?.trim()) {
    parts.push(`## User's saved X bookmarks (from TweetSmash REST)
These are posts the user already bookmarked. Cite them as prior saves, not as live public opinion and not as official docs.
When they are relevant, include a short ## Saved bookmarks section with @handle + URL. Do not invent bookmarks.

${bookmarksMarkdown.trim()}`);
  }
  return parts.join("\n\n");
}

export function buildRetrieveMessages(prompt: string) {
  return [
    { role: "system" as const, content: RETRIEVE_INSTRUCTION },
    { role: "user" as const, content: prompt },
  ];
}

// When --schema is supplied, instruct the model to return a JSON object that
// conforms to the given JSON Schema. The schema is embedded verbatim so the
// model can see property names, types, and descriptions.
export function buildSchemaMessages(prompt: string, schemaJson: string) {
  const system = `Return ONLY a valid JSON object that conforms to this JSON Schema. Do not include any text outside the JSON. Do not wrap it in Markdown fences.\n\nSchema:\n${schemaJson}`;
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: prompt },
  ];
}

/**
 * Second pass for --json + web: format grounded research into DecisionAnswer JSON
 * without web tools (so response_format json_object is safe).
 */
export function buildJsonFromResearchMessages(prompt: string, research: string, sources: string[] = []) {
  const system =
    "Return only a JSON object with keys recommendation, key_facts, tradeoffs, risks, open_questions, confidence. Use arrays of strings for key_facts, tradeoffs, risks, and open_questions. Use confidence as one of low, medium, or high. Do not wrap the JSON in Markdown. Ground every field in the research below; do not invent facts.";
  const sourceBlock = sources.length > 0 ? `\n\nSource URLs:\n${sources.join("\n")}` : "";
  return [
    { role: "system" as const, content: system },
    {
      role: "user" as const,
      content: `Original question:\n${prompt}\n\nGrounded research:\n${research}${sourceBlock}\n\nEmit the decision JSON object now.`,
    },
  ];
}

/**
 * Second pass for --schema + web: format grounded research into schema JSON
 * without web tools.
 */
export function buildSchemaFromResearchMessages(prompt: string, research: string, schemaJson: string, sources: string[] = []) {
  const system = `Return ONLY a valid JSON object that conforms to this JSON Schema. Do not include any text outside the JSON. Do not wrap it in Markdown fences. Ground fields in the research below.\n\nSchema:\n${schemaJson}`;
  const sourceBlock = sources.length > 0 ? `\n\nSource URLs:\n${sources.join("\n")}` : "";
  return [
    { role: "system" as const, content: system },
    {
      role: "user" as const,
      content: `Original question:\n${prompt}\n\nGrounded research:\n${research}${sourceBlock}\n\nEmit the schema-conforming JSON now.`,
    },
  ];
}

const X_SIGNAL_INSTRUCTION =
  "A live X/Twitter sample is provided below. Frame opinion as public conversation on that sample. Do not invent posts. Include ## X signal when X materially affects the recommendation.";

const BOOKMARKS_INSTRUCTION =
  "The user's saved X bookmarks are provided below. Treat them as prior personal context. Do not invent saves. Include ## Saved bookmarks when they materially affect the recommendation.";

function systemPrompt(
  outputFormat: OutputFormat,
  json: boolean,
  webSearch: boolean,
  hasXSignal = false,
  hasBookmarks = false,
): string {
  let prompt: string;

  if (json) {
    prompt =
      "Return only a JSON object with keys recommendation, key_facts, tradeoffs, risks, open_questions, confidence. Use arrays of strings for key_facts, tradeoffs, risks, and open_questions. Use confidence as one of low, medium, or high. Do not wrap the JSON in Markdown.";
  } else if (outputFormat === "raw") {
    prompt = "Answer directly. Do not add unnecessary framing.";
  } else if (outputFormat === "report") {
    prompt =
      "Write a detailed Markdown research report with these headings: # Research Report, ## Recommendation, ## Background, ## Evidence, ## Alternatives, ## Tradeoffs, ## Risks / unknowns, ## X signal (if X sample provided), ## Sources, ## Open questions.";
  } else {
    prompt =
      "Write a concise Markdown decision brief with exactly these headings where applicable: # Decision Brief, ## Recommendation, ## Key facts, ## Tradeoffs, ## Risks / unknowns, ## X signal (if X sample provided), ## Sources, ## Open questions. Be direct and useful to coding agents making technology or product decisions.";
  }

  if (webSearch) {
    prompt = `${prompt}\n\n${WEB_SEARCH_INSTRUCTION}`;
  }
  if (hasXSignal) {
    prompt = `${prompt}\n\n${X_SIGNAL_INSTRUCTION}`;
  }
  if (hasBookmarks) {
    prompt = `${prompt}\n\n${BOOKMARKS_INSTRUCTION}`;
  }

  return prompt;
}
