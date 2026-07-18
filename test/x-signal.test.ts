import { describe, expect, it } from "vitest";
import {
  buildWhathappenedPrompt,
  extractReportPath,
  parseXSignalText,
} from "../src/x-signal.js";

describe("buildWhathappenedPrompt", () => {
  it("starts with /whathappened and requires the marker block", () => {
    const prompt = buildWhathappenedPrompt("Composer 2.5");
    expect(prompt).toContain("/whathappened Composer 2.5");
    expect(prompt).toContain("## X_SIGNAL_MARKDOWN");
    expect(prompt).toContain("## END_X_SIGNAL");
    expect(prompt).toContain("Network filter: OFF");
  });

  it("encodes network prefer/strict", () => {
    expect(buildWhathappenedPrompt("T", "prefer")).toContain("prefer");
    expect(buildWhathappenedPrompt("T", "strict")).toContain("strict");
  });
});

describe("parseXSignalText", () => {
  it("extracts the marker block and report path", () => {
    const raw = [
      "# /whathappened: Bun",
      "**Report:** /tmp/whathappened-reports/whathappened-bun-20260718.html",
      "TL;DR stuff",
      "## X_SIGNAL_MARKDOWN",
      "### What happened",
      "Bun shipped.",
      "## END_X_SIGNAL",
      "done",
    ].join("\n");

    const parsed = parseXSignalText(raw);
    expect(parsed.usedFallback).toBe(false);
    expect(parsed.markdown).toContain("Bun shipped.");
    expect(parsed.reportPath).toBe("/tmp/whathappened-reports/whathappened-bun-20260718.html");
  });

  it("falls back to full text when markers missing", () => {
    const parsed = parseXSignalText("just a plain reply about X");
    expect(parsed.usedFallback).toBe(true);
    expect(parsed.markdown).toBe("just a plain reply about X");
  });
});

describe("extractReportPath", () => {
  it("finds free-standing whathappened html paths", () => {
    expect(extractReportPath("see ~/whathappened-reports/whathappened-foo-1.html ok")).toBe(
      "~/whathappened-reports/whathappened-foo-1.html",
    );
  });
});
