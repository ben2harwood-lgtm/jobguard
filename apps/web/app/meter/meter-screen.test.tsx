import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { loadMeter, loadMeterJobs, MeterJobs, JobsOnTheGoLine, MeterDetails, MeterScreen } from "./meter-screen";
vi.stubGlobal("React", React);
const session = { csrfToken: "csrf", memberships: [{ tenantId: "fictional-company" }] };
const view = { version: "meter-today-read.v1" as const, hypothetical: true as const, date: "2026-10-28", plan: "Builder" as const, countedPlaces: 5, freeSmallPlaces: 2 };
it("renders stored counts, allowance and the free grace place in plain words", () => {
  const html = renderToStaticMarkup(<MeterDetails view={view} />);
  for (const text of ["5 of 7 jobs on the go", "Next job included", "One grace place above 12 places is never billed", "2 small places", "2026-10-28"]) expect(html).toContain(text);
});
it.each([4, 5, 6, 7])("shows Solo included, extra, grace and beyond-grace counts: %s", count => {
  const html = renderToStaticMarkup(<MeterDetails view={{ ...view, plan: "Solo", countedPlaces: count }} />);
  expect(html).toContain(`${count} of 4 jobs on the go`);
  expect(html).toContain("One grace place above 5 places is never billed");
  expect(html).toContain(count === 4 ? "£20 a month" : count === 5 ? "next place is the free grace place" : "Further places need a move to Builder");
});
it("loads only the session-authorized endpoint with no cache", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json(view));
  expect(await loadMeter(fetcher)).toEqual(view);
  expect(fetcher).toHaveBeenNthCalledWith(2, "/api/meter/current", { cache: "no-store", credentials: "same-origin", headers: { "x-csrf-token": "csrf", "x-tenant-id": "fictional-company" } });
});
it("never substitutes zero for a missing session, missing ledger or malformed result", async () => {
  const missing = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 401 }));
  await expect(loadMeter(missing)).rejects.toThrow("SIGN_IN_REQUIRED"); expect(missing).toHaveBeenCalledTimes(1);
  for (const response of [Response.json({}, { status: 503 }), Response.json({ ...view, countedPlaces: -1 })]) {
    await expect(loadMeter(vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(response))).rejects.toThrow();
  }
});
it.each([401, 503])("finishes the rejected session response body (%s)", async status => {
  const response = Response.json({ code: "UNAUTHENTICATED" }, { status });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response);
  await expect(loadMeter(fetcher)).rejects.toThrow(status === 401 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
  expect(response.bodyUsed).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([401, 403, 503])("finishes rejected count and drill-down response bodies (%s)", async status => {
  for (const load of [loadMeter, loadMeterJobs]) {
    const response = Response.json({ code: "METER_UNAVAILABLE" }, { status });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(response);
    await expect(load(fetcher)).rejects.toThrow(status < 500 ? "SIGN_IN_REQUIRED" : "READ_UNAVAILABLE");
    expect(response.bodyUsed).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
});
it("shows a loading state without company numbers before authentication", () => {
  const html = renderToStaticMarkup(<MeterScreen />);
  expect(html).toContain('role="status"'); expect(html).toContain("hypothetical"); expect(html).not.toContain("of 7 jobs");
});

it("MON1-J held counted source stays unavailable; it never falls back to capacity numbers", async () => {
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json({version:"meter-today-error.v1",code:"METER_UNAVAILABLE"},{status:503}));
 await expect(loadMeter(fetcher)).rejects.toThrow("READ_UNAVAILABLE");
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it("shows track_review_due only from a saved decision", () => {
  expect(renderToStaticMarkup(<MeterDetails view={view} />)).not.toContain("track_review_due");
  const id = "d1500000-0000-4000-8000-000000000001";
  const html = renderToStaticMarkup(<MeterDetails view={{ ...view, trackReviewDecisionId: id }} />);
  expect(html).toContain("track_review_due"); expect(html).toContain(id);
});

const jobIds = Array.from({ length: 5 }, (_, i) => `a1500000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const jobsView = { version: "meter-today-jobs-read.v1" as const, meter: { ...view, freeSmallPlaces: 0 },
  places: jobIds.map(id => ({ jobIds: [id], kind: "place" as const })) };
it("renders five place rows with their server job references", () => {
 const html = renderToStaticMarkup(<MeterJobs view={jobsView} />);
 expect(html.match(/data-testid="meter-job-row"/g)).toHaveLength(5);
 for (const id of jobIds) expect(html).toContain(id);
 expect(html).toContain("Counts as a place");
});
it("reads the separate versioned drill-down and rejects inconsistent row counts and replays", async () => {
 const fetcher = () => vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session));
 expect(await loadMeterJobs(fetcher().mockResolvedValueOnce(Response.json(jobsView)))).toEqual(jobsView);
 for (const bad of [{ ...jobsView, places: jobsView.places.slice(1) },
   { ...jobsView, places: jobsView.places.map(() => jobsView.places[0]) },
   { ...jobsView, version: "meter-today-read.v1" }]) {
  await expect(loadMeterJobs(fetcher().mockResolvedValueOnce(Response.json(bad)))).rejects.toThrow();
 }
});
it("has no invented jobs-list line before a company read succeeds", () => {
 expect(renderToStaticMarkup(<JobsOnTheGoLine />)).toBe("");
});
