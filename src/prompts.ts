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

export function buildSynthesisMessages(prompt: string, research: string, analyses: string[], outputFormat: OutputFormat) {
  return [
    { role: "system" as const, content: systemPrompt(outputFormat) },
    {
      role: "user" as const,
      content: `Original question:\n${prompt}\n\nGrounded research:\n${research}\n\nRole analyses:\n${analyses.join("\n\n---\n\n")}\n\nSynthesize the final answer.`,
    },
  ];
}

function systemPrompt(outputFormat: OutputFormat): string {
  if (outputFormat === "raw") {
    return "Answer directly. Do not add unnecessary framing.";
  }

  if (outputFormat === "report") {
    return "Write a detailed research report with recommendation, background, evidence, alternatives, tradeoffs, risks, sources, and open questions.";
  }

  return "Write a concise decision brief with these sections: Recommendation, Key facts, Tradeoffs, Risks / unknowns, Sources. Be direct and useful to coding agents making technology or product decisions.";
}
