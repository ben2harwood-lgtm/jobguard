import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { loadMeter, MeterDetails, MeterScreen } from "./meter-screen";
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
it("shows a loading state without company numbers before authentication", () => {
  const html = renderToStaticMarkup(<MeterScreen />);
  expect(html).toContain('role="status"'); expect(html).toContain("hypothetical"); expect(html).not.toContain("of 7 jobs");
});

it("MON1-J held counted source stays unavailable; it never falls back to capacity numbers", async () => {
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json({version:"meter-today-error.v1",code:"METER_UNAVAILABLE"},{status:503}));
 await expect(loadMeter(fetcher)).rejects.toThrow("READ_UNAVAILABLE");
 expect(fetcher).toHaveBeenCalledTimes(2);
});
