import type { OutputFormat } from "./types.js";

const WEB_SEARCH_INSTRUCTION =
  "You have access to live web search. Use it for time-sensitive facts, current versions, pricing, or anything that may have changed since training. Cite authoritative sources; include URLs in ## Sources when writing Markdown.";

export function buildSingleCallMessages(prompt: string, outputFormat: OutputFormat, json = false, webSearch = false) {
  return [
    { role: "system" as const, content: systemPrompt(outputFormat, json, webSearch) },
    { role: "user" as const, content: prompt },
  ];
}

export function buildResearchMessages(prompt: string, outputFormat: OutputFormat, json = false) {
  return [
    {
      role: "system" as const,
      content: `${systemPrompt(outputFormat, json, false)}\nGround every factual claim in current sources. Include citations when available.`,
    },
    { role: "user" as const, content: prompt },
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

export function buildSynthesisMessages(prompt: string, research: string, analyses: string[], outputFormat: OutputFormat, sources: string[] = [], json = false) {
  return [
    { role: "system" as const, content: systemPrompt(outputFormat, json, false) },
    {
      role: "user" as const,
      content: `Original question:\n${prompt}\n\nGrounded research:\n${research}\n\nSource URLs:\n${sources.join("\n") || "None provided"}\n\nRole analyses:\n${analyses.join("\n\n---\n\n")}\n\nSynthesize the final answer.`,
    },
  ];
}

function systemPrompt(outputFormat: OutputFormat, json: boolean, webSearch: boolean): string {
  let prompt: string;

  if (json) {
    prompt =
      "Return only a JSON object with keys recommendation, key_facts, tradeoffs, risks, open_questions, confidence. Use arrays of strings for key_facts, tradeoffs, risks, and open_questions. Use confidence as one of low, medium, or high. Do not wrap the JSON in Markdown.";
  } else if (outputFormat === "raw") {
    prompt = "Answer directly. Do not add unnecessary framing.";
  } else if (outputFormat === "report") {
    prompt =
      "Write a detailed Markdown research report with these headings: # Research Report, ## Recommendation, ## Background, ## Evidence, ## Alternatives, ## Tradeoffs, ## Risks / unknowns, ## Sources, ## Open questions.";
  } else {
    prompt =
      "Write a concise Markdown decision brief with exactly these headings where applicable: # Decision Brief, ## Recommendation, ## Key facts, ## Tradeoffs, ## Risks / unknowns, ## Sources, ## Open questions. Be direct and useful to coding agents making technology or product decisions.";
  }

  if (webSearch) {
    prompt = `${prompt}\n\n${WEB_SEARCH_INSTRUCTION}`;
  }

  return prompt;
}
