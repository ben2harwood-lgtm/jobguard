import { expect, it } from "vitest";

// Read source only in this test, following the repository's core architecture-test convention.
const fileModule = "node:fs";
const { readFileSync } = await import(fileModule) as { readFileSync(path: URL, encoding: "utf8"): string };
it("keeps the dark baseline dependency graph restricted to validation and pure arithmetic", () => {
  const expected = new Map([
    ["rate-baseline", ["zod", "./money.js", "./quantity.js", "./rational.js"]],
    ["quantity", ["./money.js", "./rational.js"]], ["money", []], ["rational", []],
  ]);
  for (const [file, imports] of expected) {
    const source = readFileSync(new URL(`./${file}.ts`, import.meta.url), "utf8");
    const specifiers = [...source.matchAll(/\b(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']/gu)].map(match => match[1]);
    expect(specifiers.sort()).toEqual([...imports].sort());
    expect(source).not.toMatch(/\bimport\s*["']/u);
    expect(source).not.toMatch(/\b(?:require|import)\s*\(|\bfetch\s*\(/u);
    expect(source).not.toMatch(/\b(?:quote|invoice|cap)[\w-]*writer\b/iu);
  }
});
