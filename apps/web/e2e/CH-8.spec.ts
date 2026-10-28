import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// CI-only real existing routes. This is refusal coverage, not EP-C08 or the
// dependency-held shadow-30000 positive journey. No fabricated success response.
test("CH8-V unauthenticated v3 requests reveal neither dependency nor subject state", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("CI application baseURL is required");
  const context = await browser.newContext({ baseURL });
  try {
    for (const id of [randomUUID(), "AB000000-0000-4000-8000-000000000001"]) {
      const path = `/api/recovery-cases/${id}/evidence-packs`;
      for (const [url, data] of [
        [path, { version: "evidence-pack-command.v3", commandId: randomUUID(), format: "TEXT", expectedVisibleSourceRevision: "a".repeat(64) }],
        [`${path}/${randomUUID()}/attachment-approval`, { version: "evidence-pack-attachment-approval.v3", commandId: randomUUID(), expectedManifestHash: "a".repeat(64), expectedContentHash: "a".repeat(64) }],
      ] as const) {
        const response = await context.request.post(url, { data });
        expect(response.status()).toBe(401);
        expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
        expect(response.headers()["cache-control"]).toBe("no-store");
      }
    }
  } finally { await context.close(); }
});
