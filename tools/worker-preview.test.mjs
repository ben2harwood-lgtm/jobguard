import { test } from "node:test";
import assert from "node:assert/strict";
import { previewOrigin, previewUploadArgs } from "./worker-preview.mjs";

test("the preview version trusts exactly its own alias address and nothing else", () => {
  const { origin, args } = previewUploadArgs({ alias: "sq-preview", subdomain: "fictional" });
  assert.equal(origin, "https://sq-preview-jobguard-demo.fictional.workers.dev");
  assert.deepEqual(args.slice(0, 8), ["exec", "wrangler", "versions", "upload", "--preview-alias", "sq-preview", "--var", `JOBGUARD_ALLOWED_ORIGINS:${origin}`]);
  assert.ok(!args.includes("deploy"), "an upload never moves traffic on the public address");
});

test("labels that could widen or redirect the origin are refused", () => {
  for (const alias of ["*", "a.b", "A", "-x", "x-", "x/y", "x@y", "", "a b", undefined]) {
    assert.throws(() => previewOrigin({ alias, subdomain: "fictional" }), /PREVIEW_ALIAS_INVALID/u, String(alias));
  }
  assert.throws(() => previewOrigin({ alias: "ok", subdomain: "evil.example" }), /PREVIEW_SUBDOMAIN_INVALID/u);
  assert.throws(() => previewOrigin({ alias: "a".repeat(42), worker: "b".repeat(30), subdomain: "fictional" }), /PREVIEW_ALIAS_TOO_LONG/u);
});
