import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

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
    for (const path of ["", "/proposal", "/quotes", "/recovery-cases", "/readiness", "/supplier-documents", "/value"]) {
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
    await missing.addCookies([{ name: "jg_session", value: randomUUID(), domain: "127.0.0.1", path: "/" }]);
    expect((await missing.request.get(`/api/jobs/${jobId}/proposal`)).status()).toBe(401);
    // Persist a real synthetic case/artifact, then exercise every pack transport.
    const opened=await page.request.post(`/api/jobs/${jobId}/recovery-cases`,{data:{version:"recovery-case-command.v1",action:"open",commandId:randomUUID(),caseType:"merchant_overcharge",claimedNetPence:1000,counterparty:"Fictional merchant",book:"supplier_cost",sourceType:"supplier_documents",sourceRefs:[captureId],reviewerRef:"synthetic fixture",expectedRevision:0}});
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
    const owned = await page.request.get(`/api/jobs/${jobId}/proposal`);
    expect(owned.ok(), await owned.text()).toBe(true);
    expect((await owned.json()).jobId).toBe(jobId);
    await page.goto(`/jobs/${jobId}`);
    await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
  } finally { await stranger.close(); await missing.close(); }
});
