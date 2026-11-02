import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Use the bundler already installed with Vitest; no server or Next build required.
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vitest/package.json"))("esbuild");

describe("DEMO-J5 browser bundle", () => {
 it("bundles the trial guide and chooser without server application exports", async () => {
  const result = await build({
   entryPoints: [fileURLToPath(new URL("./journey.tsx", import.meta.url)),
    fileURLToPath(new URL("../chooser.tsx", import.meta.url))],
   bundle: true, platform: "browser", write: false, outdir: "trial-browser-check",
   metafile: true, logLevel: "silent",
  });
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs.some(path => path.endsWith("trial/journey.tsx"))).toBe(true);
  expect(inputs.some(path => path.endsWith("demo-s/chooser.tsx"))).toBe(true);
  expect(inputs.filter(path => /(?:apps\/api|packages\/db)\/(?:src|dist)\//u.test(path))).toEqual([]);
 });
});
