import type { OutputFormat } from "./types.js";

export function buildSingleCallMessages(prompt: string, outputFormat: OutputFormat) {
  return [
    { role: "system" as const, content: systemPrompt(outputFormat) },
    { role: "user" as const, content: prompt },
  ];
}

export function buildResearchMessages(prompt: string, outputFormat: OutputFormat) {
  return [
    {
      role: "system" as const,
      content: `${systemPrompt(outputFormat)}\nGround every factual claim in current sources. Include citations when available.`,
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

export function buildSynthesisMessages(prompt: string, research: string, analyses: string[], outputFormat: OutputFormat, sources: string[] = []) {
  return [
    { role: "system" as const, content: systemPrompt(outputFormat) },
    {
      role: "user" as const,
      content: `Original question:\n${prompt}\n\nGrounded research:\n${research}\n\nSource URLs:\n${sources.join("\n") || "None provided"}\n\nRole analyses:\n${analyses.join("\n\n---\n\n")}\n\nSynthesize the final answer.`,
    },
  ];
}

function systemPrompt(outputFormat: OutputFormat): string {
  if (outputFormat === "raw") {
    return "Answer directly. Do not add unnecessary framing.";
  }

  if (outputFormat === "report") {
    return "Write a detailed Markdown research report with these headings: # Research Report, ## Recommendation, ## Background, ## Evidence, ## Alternatives, ## Tradeoffs, ## Risks / unknowns, ## Sources, ## Open questions.";
  }

  return "Write a concise Markdown decision brief with exactly these headings where applicable: # Decision Brief, ## Recommendation, ## Key facts, ## Tradeoffs, ## Risks / unknowns, ## Sources, ## Open questions. Be direct and useful to coding agents making technology or product decisions. If the caller requested JSON, instead return a JSON object with keys recommendation, key_facts, tradeoffs, risks, open_questions, confidence.";
}
