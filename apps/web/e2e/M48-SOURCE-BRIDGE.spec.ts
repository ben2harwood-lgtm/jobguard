import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// CI ONLY, NOT RUN. These are unfulfilled transport acceptance gates: no route
// is composed on this build-ahead base. A 404 does NOT pass as authorization.
// Saved-ID/reload/accessibility journeys remain held with the source/UI adapter.
test("M48-B1-A2/A7: anonymous reads and writes cannot disclose source existence", async ({ browser }, testInfo) => {
 const context = await browser.newContext({ ...(testInfo.project.use.baseURL === undefined ? {} : { baseURL: testInfo.project.use.baseURL }) });
 try {
  for (const jobId of [randomUUID(), randomUUID()]) {
   const path = `/api/jobs/${jobId}/receipt-line-allocations`;
   const read = await context.request.get(path);
   expect(read.status()).toBe(401);
   expect(await read.json()).toEqual({ version: "receipt-line-allocation-error.v1", code: "UNAUTHENTICATED" });
   const write = await context.request.post(path, { data: { version: "receipt-line-allocation-command.v1", action: "review", commandId: randomUUID(), expectedSourceRevision: 1, paymentId: randomUUID() } });
   expect(write.status()).toBe(401);
   expect(await write.json()).toEqual({ version: "receipt-line-allocation-error.v1", code: "UNAUTHENTICATED" });
  }
 } finally { await context.close(); }
});
