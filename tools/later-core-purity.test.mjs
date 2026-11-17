// LATER-B19 negative controls for tools/core-purity-lint.mjs. Fictional in-memory source only.
import assert from "node:assert/strict";
import test from "node:test";

const { checkCorePuritySource } = await import("./core-purity-lint.mjs");
const refused = (text) => checkCorePuritySource("fixture/core.ts", text);

test("B19-P1 static filesystem and network imports are refused, with node: and bare names", () => {
  for (const specifier of ["fs", "node:fs", "fs/promises", "node:fs/promises", "net", "node:net", "http", "node:https", "node:child_process", "dns", "node:dgram", "node:tls", "node:http2"]) {
    assert.equal(refused(`import x from "${specifier}";`).length, 1, specifier);
    assert.equal(refused(`import { readFileSync } from "${specifier}";`).length, 1, specifier);
    assert.equal(refused(`import * as ns from "${specifier}";`).length, 1, specifier);
    assert.equal(refused(`import type { T } from "${specifier}";`).length, 1, `${specifier} type-only import is still a platform dependency`);
  }
  assert.equal(refused('import pg from "pg"; fetch("https://example.invalid");').length, 2);
  assert.equal(refused('import S from "stripe";').length, 1);
  assert.equal(refused('import A from "@anthropic-ai/sdk";').length, 1);
  assert.equal(refused('import A from "@aws-sdk/client-s3";').length, 1);
  assert.equal(refused('import fs = require("node:fs");').length, 1);
  assert.equal(refused('const fs = require("fs");').length, 1);
});

test("B19-P2 named and star re-exports from forbidden modules are refused", () => {
  assert.equal(refused('export * from "node:fs";').length, 1);
  assert.equal(refused('export * as net from "net";').length, 1);
  assert.equal(refused('export { readFile } from "fs/promises";').length, 1);
  assert.equal(refused('export { default as pg } from "pg";').length, 1);
  assert.equal(refused('export { local } from "./local.js";').length, 0);
});

test("B19-P3 side-effect imports and literal dynamic imports are checked", () => {
  assert.equal(refused('import "node:net";').length, 1);
  assert.equal(refused('import "pg";').length, 1);
  assert.equal(refused('const m = await import("node:http");').length, 1);
  assert.equal(refused("const m = await import(`fs`);").length, 1);
  assert.equal(refused('const m = import("./ok.js");').length, 0);
  // computed module names cannot be resolved statically: refused as unverifiable.
  const computed = refused("const name = 'f' + 's'; const m = await import(name);");
  assert.equal(computed.length, 1);
  assert.match(computed[0], /computed module name/u);
  assert.equal(refused("const m = require(name);").length, 1);
});

test("B19-P4 ordinary local imports and harmless comments and strings stay accepted", () => {
  const harmless = [
    'import { money } from "./money.js";',
    'import { z } from "zod";',
    'import { createHash } from "node:crypto";',
    'export * from "./cumulative-fee.js";',
    '// import fs from "node:fs"; fetch("x"); import("fs")',
    '/* export * from "net"; */',
    'const s = "import pg from \\"pg\\"; fetch(1)";',
    "const t = `from \"fs\"`;",
    "const prefetch = (fetcher: unknown) => fetcher; const o = { fetch: 1 }; o.fetch;",
  ].join("\n");
  assert.deepEqual(refused(harmless), []);
});

test("B19-P3b the report mode lists computed module names without counting them as violations", () => {
  const computed = "const m = await import(name);";
  assert.deepEqual(checkCorePuritySource("fixture/core.ts", computed, { computed: "report" }), []);
  const collected = checkCorePuritySource("fixture/core.ts", computed, { computed: "report", collect: true });
  assert.equal(collected.failures.length, 0);
  assert.equal(collected.unverifiable.length, 1);
  assert.equal(checkCorePuritySource("fixture/core.ts", 'import "node:fs"; import(name);', { computed: "report" }).length, 1);
});

test("B19-P5 member .fetch() calls stay refused as before", () => {
  assert.equal(refused('ns.fetch("x");').length, 1);
  assert.equal(refused('client.fetch ("x");').length, 1);
  assert.equal(refused('import * as undici from "undici"; undici.fetch("https://example.invalid");').length, 1);
  assert.equal(refused('const f = globalThis; f.fetch("x");').length, 1);
  assert.equal(refused('globalThis["fetch"]("x");').length, 1);
  assert.equal(refused('new o.fetch("x");').length, 1);
  assert.equal(refused('new fetch("x");').length, 1);
  assert.equal(refused('(0, o.fetch)("x");').length, 1);
  assert.equal(refused('(o.fetch as any)("x");').length, 1);
  assert.equal(refused('o.fetch!("x");').length, 1);
  assert.deepEqual(refused("const o = { fetch: 1 }; o.fetch;"), []);
});
