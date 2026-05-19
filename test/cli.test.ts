import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("cli", () => {
  it("emits JSON errors for parse failures when --json is present", () => {
    const result = spawnSync("pnpm", ["tsx", "src/cli.ts", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({ error: { message: "Missing prompt" } });
  });
});
