import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { JobSummary } from "../lib/contracts";
const state = vi.hoisted(() => ({ jobs: [] as JobSummary[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./designed-ui", async original => ({ ...await original<typeof import("./designed-ui")>(), useJobs: () => ({ jobs: state.jobs, failed: false }) }));
import { StateScreen, shortDate, quoteLine, type Workspace } from "./designed-ui";
import { JobsList, Overview, MoneyTab } from "./jobs-screens";
import { Today } from "./home-screens";
vi.stubGlobal("React", React);
const job: JobSummary = { id: "10000000-0000-4000-8000-000000000001", tenantId: "20000000-0000-4000-8000-000000000001", title: "Practice extension", status: "draft", customerLabel: "Customer", siteLabel: "Site", updatedLabel: "", document: { kind: "none", reference: null, delivery: "not_sent" }, customerPayment: "unknown", pilotNoCharge: true };
const workspace = { tenantId: job.tenantId, pending: 0, decisions: null, session: { principal: { displayName: "Builder" }, tenants: [{ id: job.tenantId, name: "Firm A" }] } } as Workspace;
it("formats the saved date in London without a revision or weekday, and omits an invalid date", () => {
  expect(shortDate("2026-11-09T12:00:00Z")).toBe("9 Nov");
  expect(shortDate("2026-06-09T23:30:00Z")).toBe("10 Jun");
  expect(shortDate("invalid")).toBe("");
});
it.each([
  ["draft", "none", "not_sent", "Quote not sent yet"],
  ["quoting", "quote", "delivered", "Quote sent, waiting for the customer"],
  ["accepted", "unknown", "unknown", "Quote accepted"],
] as const)("renders the %s quote state on both job card screens and the overview", (status, kind, delivery, text) => {
  const current = { ...job, status, document: { kind, delivery, reference: null } };
  state.jobs = [current];
  for (const screen of [<JobsList workspace={workspace}/>, <Today workspace={workspace}/>, <Overview site="Site" detail={{ job: { ...current, revision: 4, updatedAt: "2026-11-09T12:00:00Z", scopeIdentityIds: [] }, summary: current, value: null, checks: 0, photo: "/design/assets/reference-job-martin.jpg" }}/>]) {
    const html = renderToStaticMarkup(screen);
    expect(html).toContain(text);
    expect(html).not.toContain("Server revision");
    expect(html).not.toContain("£"); // No stored accepted total in these reads; never derive one.
  }
});
it.each(["queued", "outcome_unknown", "unknown"] as const)("does not claim an unconfirmed delivery was sent (%s)", delivery => {
  const text = quoteLine({ ...job, status: "quoting", document: { kind: "unknown", reference: null, delivery } });
  expect(text).not.toBe("Quote sent, waiting for the customer");
  expect(text).not.toBe("Quote not sent yet");
});
it.each(["draft", "accepted", "live"] as const)("adds the agreed line without changing the existing money lines (%s)", status => {
  const html = renderToStaticMarkup(<MoneyTab value={null} status={status}/>);
  expect(html).toContain("Agreed with the customer");
  expect(html).toContain(status === "draft" ? "Nothing agreed yet" : "Quote accepted — total not available here");
  for (const text of ["Approved extras", "Not automatically invoiced.", "Invoiced", "Including VAT.", "Recorded as paid", "Entered by hand, not bank-confirmed.", "Still owed", "Invoiced but not yet recorded as paid.", "Priced extras waiting for a customer decision", "Not included in the approved amounts above.", "An extra being approved does not mean it has been invoiced. An invoice being issued does not mean the customer has paid. A manually entered receipt does not prove bank settlement."]) expect(html).toContain(text);
});
it("offers the blank practice firm first and keeps example sign-in as the secondary action", () => {
  const html = renderToStaticMarkup(<StateScreen load={{ state: "signed-out" }} retry={() => {}} title="Today"/>);
  expect(html).toContain('class="btn primary" href="/practice-company">Start my own practice firm</a>');
  expect(html).toContain('class="btn">Look around an example firm</button>');
  expect(html.indexOf("Start my own practice firm")).toBeLessThan(html.indexOf("Look around an example firm"));
  expect(html).toContain("Made-up jobs only. Nothing is sent or charged.");
});
