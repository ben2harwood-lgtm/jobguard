import { expect, it } from "vitest";
const fileModule = "node:fs";
const { readFileSync } = await import(fileModule) as { readFileSync(path: URL, encoding: "utf8"): string };
it("M1L-09 transitive dependencies are pure core with no shadow, provider, DB or ambient clock", () => {
  const visited = new Set<string>();
  const allowed = new Set(["meter-lifecycle.ts", "job-work-state.ts", "job-work-timing.ts", "jobs-on-the-go.ts", "small-job-v3.ts", "money.ts", "rational.ts"]);
  function walk(file: URL) {
    if (visited.has(file.href)) return;
    visited.add(file.href);
    expect(allowed.has(file.pathname.split("/").at(-1)!)).toBe(true);
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/Date\.now\s*\(|new\s+Date\s*\(\s*\)|\b(?:fetch|setTimeout|setInterval)\s*\(|Math\.random\s*\(/u);
    const imports = [...source.matchAll(/(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gu)].map(match => match[1]!);
    expect(source).not.toMatch(/\bimport\s*\(/u);
    for (const name of imports) {
      if (name === "zod") continue;
      expect(name).toMatch(/^\.\/[^/]+\.js$/u);
      walk(new URL(name.replace(/\.js$/u, ".ts"), file));
    }
  }
  // Resolve the source tree from either src or a compiled dist test copy.
  walk(new URL("../src/meter-lifecycle.ts", import.meta.url));
  expect(visited.size).toBeGreaterThan(3);
});
