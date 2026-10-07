import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { startWatchdogJob } from "./helpers/capture-journey";

test("creation binds ownership before another session's first read or write", async ({ page, browser }) => {
  expect((await page.request.post("/api/session")).ok()).toBe(true);
  const captureId = randomUUID();
  const capture = await page.request.post("/api/jobs/capture", { data: {
    contractVersion: "job_capture_v1", requested_tenant_id: "11111111-1111-4111-8111-111111111111",
    captureId, fixtureId: "sbox-session-isolation", source: { kind: "text", text: "JOB: Fictional isolation job\nITEM: Paint fictional room | £100.00" },
  } });
  expect(capture.status(), await capture.text()).toBe(201);
  const { jobId } = await capture.json(); // No workspace mount or follow-up request by creator.
  const stranger = await browser.newContext({ baseURL: "http://127.0.0.1:3000", viewport: page.viewportSize() });
  const missing = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    expect((await stranger.request.post("/api/session")).ok()).toBe(true);
    for (const path of ["", "/proposal", "/quotes", "/quotes/delivery", "/recovery-cases", "/readiness", "/supplier-documents", "/value"]) {
      const read = await stranger.request.get(`/api/jobs/${jobId}${path}`);
      expect(read.status(), await read.text()).toBe(404);
      expect(await read.json()).toMatchObject({ code: "NOT_FOUND" });
    }
    for (const path of ["/recovery-cases", "/recovery-cases/eligibility", "/quotes/activation", "/readiness/advance", "/confirm"]) {
      const write = await stranger.request.post(`/api/jobs/${jobId}${path}`, { data: {} });
      expect(write.status(), await write.text()).toBe(404);
    }
    for (const method of ["get", "post"] as const) {
      expect((await missing.request[method](`/api/jobs/${jobId}/recovery-cases`, { data: {} })).status()).toBe(401);
    }
    const missingDelivery=await missing.request.get(`/api/jobs/${jobId}/quotes/delivery`);
    expect(missingDelivery.status(),await missingDelivery.text()).toBe(401);
    expect(await missingDelivery.json()).toEqual({code:"UNAUTHENTICATED"});
    await missing.addCookies([{ name: "jg_session", value: randomUUID(), domain: "127.0.0.1", path: "/" }]);
    expect((await missing.request.get(`/api/jobs/${jobId}/proposal`)).status()).toBe(401);
    const inventedDelivery=await missing.request.get(`/api/jobs/${jobId}/quotes/delivery`);
    expect(inventedDelivery.status(),await inventedDelivery.text()).toBe(401);
    expect(await inventedDelivery.json()).toEqual({code:"UNAUTHENTICATED"});
    // Keep the first captured job unconfirmed for the ownership/reload assertions.
    // Supplier inputs need a separate owned job switched live through real commands.
    {
      const liveCapture = await page.request.post("/api/jobs/capture", { data: {
        contractVersion: "job_capture_v1", requested_tenant_id: "11111111-1111-4111-8111-111111111111",
        captureId: randomUUID(), fixtureId: "sbox-session-isolation",
        source: { kind: "text", text: "JOB: Fictional live isolation job\nITEM: Paint fictional room | £100.00" },
      } });
      expect(liveCapture.status(), await liveCapture.text()).toBe(201);
      const { jobId, proposal } = await liveCapture.json();
      await page.goto(`/jobs/${jobId}`);
      await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
      for (const line of proposal.lines) {
        await page.getByRole("button", { name: `Accept ${line.description.value}`, exact: true }).click();
        if (line.quantity.value === null) await page.getByLabel(`Quantity ${line.description.value}`, { exact: true }).fill("1");
        if (line.unit.value === null) await page.getByLabel(`Unit ${line.description.value}`, { exact: true }).fill("item");
      }
      for (const question of proposal.questions) await page.getByLabel(`Answer ${question.question.value}`, { exact: true }).fill("Fictional builder confirms this practice scope");
      await page.getByRole("button", { name: "Confirm scope", exact: true }).click();
      await startWatchdogJob(page);
      // Bind resolvable supplier sources to the live session-owned job.
      const post = async (path: string, data: unknown) => {
        const response = await page.request.post(path, { data });
        expect(response.ok(), await response.text()).toBe(true);
        return response.json();
      };
      const rate = await post("/api/material-rates", { version: "material-rate-command.v1", merchantName: "Fictional isolation merchant", sku: "ISOLATION-PACK", description: "Fictional material", pricePence: 2000, priceUnit: "each", taxBasis: "net", effectiveFrom: "2026-09-01", sourceLabel: "Synthetic agreement", expectedVersion: 0 });
      await post(`/api/jobs/${jobId}/materials`, { version: "material-requirement-command.v1", scopeItemId: proposal.lines[0].scopeItemId, skuId: rate.skuId, quantity: "40", unit: "each", expectedRevision: 0 });
      const materialRead = await page.request.get(`/api/jobs/${jobId}/materials`);
      expect(materialRead.ok(), await materialRead.text()).toBe(true);
      const requirement = (await materialRead.json()).materials.at(-1);
      await post(`/api/jobs/${jobId}/purchase-orders/revisions`, { version: "purchase-order-draft.v1", requirementId: requirement.id, quantity: "40", unitPricePence: 2000, recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
      const documentsPath = `/api/jobs/${jobId}/supplier-documents`;
      for (const [expectedRevision, fixtureId] of ["materials-320-invoice", "materials-B-delivery"].entries()) {
        await post(`${documentsPath}/intake`, { version: "supplier-document-intake.v1", fixtureId, channel: "picker", expectedRevision });
      }
      const documentRead = await page.request.get(documentsPath);
      expect(documentRead.ok(), await documentRead.text()).toBe(true);
      const documents = (await documentRead.json()).state.documents;
      expect(documents).toHaveLength(2);
      // Persist a real synthetic case/artifact, then exercise every pack transport.
      const opened=await page.request.post(`/api/jobs/${jobId}/recovery-cases`,{data:{version:"recovery-case-command.v1",action:"open",commandId:randomUUID(),caseType:"merchant_overcharge",claimedNetPence:1000,counterparty:"Fictional merchant",book:"supplier_cost",sourceType:"supplier_documents",sourceRefs:[rate.id,...documents.map((document: { id: string }) => document.id)],reviewerRef:"practice-owner",expectedRevision:0}});
      expect(opened.ok(),await opened.text()).toBe(true);
      const caseId=(await opened.json()).cases[0].id;
      const packPath=`/api/recovery-cases/${caseId}/evidence-packs`;
      const generated=await page.request.post(packPath,{data:{version:"evidence-pack-command.v1",commandId:randomUUID()}});
      expect(generated.ok(),await generated.text()).toBe(true);
      const before=await generated.json(),pack=before.packs[0];
      for(const path of [packPath,`${packPath}/${pack.id}/inspect`,`${packPath}/${pack.id}/download`]){
        const denied=await stranger.request.get(path);expect(denied.status(),await denied.text()).toBe(404);
      }
      for(const path of [packPath,`${packPath}/${pack.id}/attachment-approval`]){
        const denied=await stranger.request.post(path,{data:{}});expect(denied.status(),await denied.text()).toBe(404);
      }
      expect((await page.request.get(packPath)).ok()).toBe(true);
      expect(await (await page.request.get(packPath)).json()).toEqual(before);
    }
    const owned = await page.request.get(`/api/jobs/${jobId}/proposal`);
    expect(owned.ok(), await owned.text()).toBe(true);
    expect((await owned.json()).jobId).toBe(jobId);
    await page.goto(`/jobs/${jobId}`);
    await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
  } finally { await stranger.close(); await missing.close(); }
});
