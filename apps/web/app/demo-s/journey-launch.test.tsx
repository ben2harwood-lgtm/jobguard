import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { recoverShadowCapture, readShadowResults } from "./journey-launch";
import { JourneyResult } from "./journey-result";
const runId = "d1500000-0000-4000-8000-000000000001";
const jobId = "d1500000-0000-4000-8000-000000000002";
const session = { version: 1, principal: { displayName: "Practice" }, tenants: [{ id: jobId, name: "Practice" }] };
const capture = { version: 1, environment: "synthetic_demo", captureId: runId, jobId, proposalId: runId, reviewId: runId,
  source: { text: "Fiction", version: 1, kind: "text", acquisition: null, audioByteLength: 0 },
  proposal: { title: "Fiction", lines: [], questions: [] }, review: null, status: "draft" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());
it("starts the practice workspace only when absent and replays the selection's exact capture identity", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply({}, 401)).mockResolvedValueOnce(reply({ ok: true }))
    .mockResolvedValueOnce(reply(session)).mockResolvedValueOnce(reply(capture))
    .mockResolvedValueOnce(reply(session)).mockResolvedValueOnce(reply(capture));
  vi.stubGlobal("fetch", fetch);
  expect(await recoverShadowCapture(runId)).toBe(jobId);
  expect(await recoverShadowCapture(runId)).toBe(jobId);
  const calls = fetch.mock.calls.filter(call => call[0] === "/api/jobs/capture");
  expect(calls).toHaveLength(2); expect(calls[0]).toEqual(calls[1]);
  expect(JSON.parse(calls[0]![1].body)).toMatchObject({ captureId: runId, requested_tenant_id: jobId, source: { kind: "text" } });
  expect(fetch.mock.calls.filter(call => call[1]?.method === "POST" && call[0] === "/api/session")).toHaveLength(1);
});
it("does not replace an uncertain capture identity or a failed workspace", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply(session)).mockResolvedValueOnce(reply({}, 503));
  vi.stubGlobal("fetch", fetch);
  await expect(recoverShadowCapture(runId)).rejects.toThrow("Capture outcome unconfirmed");
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockReset().mockResolvedValue(reply({}, 503));
  await expect(recoverShadowCapture(runId)).rejects.toThrow("workspace is unavailable");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("refuses capture mismatches and foreign or pre-lock hidden reports", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply(session)).mockResolvedValueOnce(reply({ ...capture, captureId: jobId }));
  vi.stubGlobal("fetch", fetch);
  await expect(recoverShadowCapture(runId)).rejects.toThrow("does not match");
  fetch.mockResolvedValue(reply({ jobId: runId, completed: true }));
  await expect(readShadowResults(jobId)).rejects.toThrow();
  fetch.mockResolvedValue(reply({}, 404));
  await expect(readShadowResults(jobId)).rejects.toThrow("unavailable");
});
it("renders no invented results before a persisted read and disables archived launch", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(<JourneyResult runId={runId} tenantId={jobId} archived disabled={false} onBusyChange={() => {}} />);
  expect(html).toContain("archived"); expect(html.match(/disabled=""/g)).toHaveLength(2);
  expect(html).not.toContain("Saved job evidence"); expect(html).not.toContain("£80");
});

const savedReport = () => ({
  version: "shadow-demo-report.v2", environment: "synthetic_demo", jobId, status: "incomplete", realExternalActions: 0,
  customerApproval: { state: "not_ready_yet", approvals: [] },
  account: { jobId, account: null, captures: [], lock: null },
  invoices: { version: 1, environment: "synthetic_demo", jobId, invoices: [] },
  value: { version: "job-value.v3", environment: "synthetic_demo", jobId, status: "incomplete", reason: "producer_bindings_held",
    producers: { sources: "HELD", derivation: "HELD", subscription: "HELD", postedMoney: "HELD" }, asOf: null, receipt: null },
});
it("reads the same saved job through report v2 without substituting target outcomes", async () => {
  const raw = savedReport();
  const fetch = vi.fn().mockResolvedValue(reply(raw));
  vi.stubGlobal("fetch", fetch);
  expect(await readShadowResults(jobId)).toEqual(raw);
  expect(fetch).toHaveBeenCalledWith(`/api/jobs/${jobId}/shadow-demo`, { cache: "no-store" });
});
it("rejects stale v1, cross-job and pre-lock hidden results on the chooser read path", async () => {
  const raw = savedReport();
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  for (const patch of [
    { version: "shadow-demo-report.v1", customerApproval: "not_ready_yet" },
    { jobId: runId }, { account: { ...raw.account, jobId: runId } },
    { invoices: { ...raw.invoices, jobId: runId } }, { value: { ...raw.value, jobId: runId } },
    { assessments: [] }, { packs: [] }, { finalCheck: { state: "unlocked", items: [] } },
  ]) {
    fetch.mockResolvedValue(reply({ ...raw, ...patch }));
    await expect(readShadowResults(jobId)).rejects.toThrow();
  }
});

it("reports a lost capture reply as unconfirmed and replays the restored selection without a new session or identity", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply(session)).mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(reply(session)).mockResolvedValueOnce(reply(capture));
  vi.stubGlobal("fetch", fetch);
  await expect(recoverShadowCapture(runId)).rejects.toThrow("Capture outcome unconfirmed. Retry this selection to recover the same request.");
  // A fresh call after reload receives only the server-restored selection ID.
  expect(await recoverShadowCapture(runId)).toBe(jobId);
  const calls = fetch.mock.calls.filter(call => call[0] === "/api/jobs/capture");
  expect(calls).toHaveLength(2); expect(calls[0]).toEqual(calls[1]);
  expect(JSON.parse(calls[1]![1].body).captureId).toBe(runId);
  expect(fetch.mock.calls.filter(call => call[0] === "/api/session" && call[1]?.method === "POST")).toHaveLength(0);
});
