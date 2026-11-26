import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

// V2-SQ3: an edited transcript or recording fails here as well as in the e2e specs.
const dir = resolve(__dirname, "../e2e/fixtures/spoken-quote");
const readme = readFileSync(join(dir, "README.md"), "utf8");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

it("every spoken-quote transcript matches the sha256 its README records, with no trailing newline", () => {
  const files = readdirSync(dir).filter(name => name.endsWith(".txt"));
  expect(files.length).toBeGreaterThanOrEqual(5);
  for (const name of files) {
    const bytes = readFileSync(join(dir, name));
    expect(readme, name).toContain(`| \`${name}\` | \`${sha(bytes)}\` |`);
    expect(bytes.toString("utf8"), name).toMatch(/^[a-z ]+$/u);
  }
});
it("the recording matches its README sha256", () => {
  expect(readme).toContain(`**sha256:** \`${sha(readFileSync(join(dir, "../spoken-quote-real.wav")))}\``);
});
