import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("core purity detector bites on database and network imports", () => {
  const fixture = mkdtempSync(join(tmpdir(), "jobguard-purity-"));
  writeFileSync(join(fixture, "bad.ts"), 'import pg from "pg"; fetch("https://example.invalid");');
  assert.throws(() => execFileSync(process.execPath, ["tools/core-purity-lint.mjs", fixture], { stdio: "pipe" }));
});
