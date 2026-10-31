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
