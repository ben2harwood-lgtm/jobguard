import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { JobSummary } from "../lib/contracts";
const state = vi.hoisted(() => ({ jobs: [] as JobSummary[], facts: null as Record<string, JobFacts> | null, decisions: null as Decisions | null }));
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: unknown[] = [], effects: (() => void)[] = [];
  const cleanups = new Map<number, () => void>();
  return {
    active: false,
    reset() { for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); slots.length = 0; effects.length = 0; cursor = 0; },
    render() { cursor = 0; },
    setState(index: number, value: unknown) { slots[index] = value; },
    flush() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useEffect(callback: () => (() => void) | void, deps: unknown[]) {
      const index = cursor++, old = slots[index] as unknown[] | undefined;
      if (!old || !deps.every((value, i) => Object.is(value, old[i]))) {
        slots[index] = deps;
        effects.push(() => { cleanups.get(index)?.(); const cleanup = callback(); if (cleanup) cleanups.set(index, cleanup); });
      }
    },
  };
});
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual,
    useState: (initial: unknown) => hooks.active ? hooks.useState(initial) : actual.useState(initial),
    useEffect: (callback: () => (() => void) | void, deps: unknown[]) => hooks.active ? hooks.useEffect(callback, deps) : actual.useEffect(callback, deps),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./designed-ui", async original => {
  const actual = await original<typeof import("./designed-ui")>();
  return { ...actual, Screen: ({ children }: { children: (workspace: Workspace) => React.ReactNode }) => children(workspace),
    useJobs: () => ({ jobs: state.jobs, failed: false }), useJobFacts: () => state.facts,
    useAttention: () => ({ items: actual.attentionJobs(state.jobs, state.decisions, state.facts), complete: state.decisions !== null && state.facts !== null && state.jobs.every(job => state.facts?.[job.id]?.checksAvailable), loading: state.facts === null && state.decisions === null, failed: state.facts !== null && (state.decisions === null || state.jobs.some(job => !state.facts?.[job.id]?.checksAvailable)) }) };
});
import { StateScreen, shortDate, quoteLine, agreedLine, attentionJobs, projectBillCheck, readJobFacts, unavailableFacts, jobValueV1, catchLabel, type JobFacts, type Decisions, type Workspace } from "./designed-ui";
import { DesignedJob, JobsList, Overview, MoneyTab, useJobDetail } from "./jobs-screens";
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
  expect(html).toContain("Agreed total unavailable");
  expect(html).not.toContain("£");
  for (const text of ["Approved extras", "Not automatically invoiced.", "Invoiced", "Including VAT.", "Recorded as paid", "Entered by hand, not bank-confirmed.", "Still owed", "Invoiced but not yet recorded as paid.", "Priced extras waiting for a customer decision", "Not included in the approved amounts above.", "An extra being approved does not mean it has been invoiced. An invoice being issued does not mean the customer has paid. A manually entered receipt does not prove bank settlement."]) expect(html).toContain(text);
});
it("offers the blank practice firm first and keeps example sign-in as the secondary action", () => {
  const html = renderToStaticMarkup(<StateScreen load={{ state: "signed-out" }} retry={() => {}} title="Today"/>);
  expect(html).toContain('class="btn primary" href="/practice-company">Start my own practice firm</a>');
  expect(html).toContain('class="btn">Look around an example firm</button>');
  expect(html.indexOf("Start my own practice firm")).toBeLessThan(html.indexOf("Look around an example firm"));
  expect(html).toContain("Made-up jobs only. Nothing is sent or charged.");
});

const detailJob = { ...job, revision: 4, updatedAt: "2026-11-09T12:00:00Z", scopeIdentityIds: [] };
it.each([{ scopeIdentityIds: [] }, { scopeIdentityIds: ["30000000-0000-4000-8000-000000000001"] }])("visibly discloses the Overview illustration beside saved job facts (%j)", ({ scopeIdentityIds }) => {
  const html = renderToStaticMarkup(<Overview site="Site" detail={{ job: { ...detailJob, scopeIdentityIds }, summary: job, value: null, checks: 0, photo: "/design/assets/reference-job-martin.jpg" }}/>);
  expect(html).toContain('<p class="photo-disclosure">Illustrative photograph of a property</p>');
  expect(html.indexOf('class="photo-disclosure"')).toBeLessThan(html.indexOf("AGREED WORK"));
  expect(html).toContain(`<h3>${job.title}</h3>`);
  expect(html).toContain(scopeIdentityIds.length ? "1 confirmed item of work." : "The agreed work has not been confirmed yet.");
  expect(html).toContain('src="/design/assets/reference-job-martin.jpg"');
});
const emptyDecisions: Decisions = { decisions: [], counts: { mandatory: 0, advisory: 0, pending: 0 } };
const facts: JobFacts = { agreed: 108000, payment: { state: "not_invoiced", label: "Work under way", paymentStatus: "No invoice issued", invoiceCount: 0 }, value: null, blocker: null, checksAvailable: true };
beforeEach(() => { state.jobs = []; state.facts = null; state.decisions = null; hooks.active = false; });
afterEach(() => { hooks.reset(); hooks.active = false; vi.unstubAllGlobals(); vi.stubGlobal("React", React); });

it("keeps each saved job's illustration when searching, reordering or adding jobs", () => {
  hooks.active = true;
  const second = { ...job, id: "10000000-0000-4000-8000-000000000002", title: "Second fictional job" };
  const added = { ...job, id: "10000000-0000-4000-8000-000000000003", title: "Added fictional job" };
  const photos = () => {
    hooks.render();
    const html = renderToStaticMarkup(<JobsList workspace={workspace}/>);
    return Object.fromEntries([...html.matchAll(/<article class="job-row"><img[^>]*src="([^"]+)"[^>]*alt="Illustrative building"[^>]*\/><div class="job-name"><strong>([^<]+)<\/strong>/gu)].map(([, src, title]) => [title, src]));
  };
  state.jobs = [job, second];
  const original = photos();
  expect(Object.keys(original)).toEqual([job.title, second.title]);
  expect(new Set(Object.values(original)).size).toBe(2);
  state.jobs = [second, job];
  expect(photos()).toEqual(original);
  state.jobs = [added, second, job];
  expect(photos()).toMatchObject(original);
  hooks.setState(0, job.title);
  expect(photos()).toEqual({ [job.title]: original[job.title] });
  hooks.setState(0, "no matching job");
  expect(photos()).toEqual({});
  hooks.setState(0, "");
  expect(photos()).toMatchObject(original);
});

it("loads the same illustration in Overview regardless of the saved list order or a missing summary", async () => {
  const second = { ...job, id: "10000000-0000-4000-8000-000000000002", title: "Second fictional job" };
  state.jobs = [second, job];
  const list = renderToStaticMarkup(<JobsList workspace={workspace}/>);
  const photo = /src="([^"]+)"[^>]*alt="Illustrative building"[^>]*\/><div class="job-name"><strong>Practice extension<\/strong>/u.exec(list)?.[1];
  expect(photo).toBeTruthy();
  for (const jobs of [[second, job], [job, second], []]) {
    hooks.reset(); hooks.active = true;
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.startsWith("/api/jobs?")
      ? { version: 1, tenantId: job.tenantId, jobs }
      : { version: 1, environment: "synthetic_demo", job: detailJob })));
    const render = () => { hooks.render(); const html = renderToStaticMarkup(<DesignedJob jobId={job.id} tab="overview"/>); hooks.flush(); return html; };
    render();
    await vi.waitFor(() => expect(render()).toContain(`src="${photo}" alt="Illustrative photograph of a property"`));
  }
});

it("shows the active accepted gross on every designed card and Money without inventing invoice money", () => {
  state.jobs = [{ ...job, status: "live" }]; state.facts = { [job.id]: facts }; state.decisions = emptyDecisions;
  for (const screen of [<JobsList workspace={workspace}/>, <Today workspace={workspace}/>, <Overview site="Site" detail={{ job: detailJob, summary: job, value: null, checks: 0, photo: "", facts, attentionComplete: true }}/>, <MoneyTab value={null} status="live" facts={facts}/>]) {
    const html = renderToStaticMarkup(screen);
    expect(html).toContain("Agreed £1,080.00");
    expect(html).not.toContain("total not available here");
    expect(html).toContain("No invoice issued");
    expect(html.toLowerCase()).toContain("not bank-confirmed");
  }
});
it("shows both locked bills once per job, with every reason, and never shows an all-clear during partial failure", () => {
  const second = { ...job, id: "10000000-0000-4000-8000-000000000002", title: "Second fictional job" };
  const blocker = "Final Check failed — this bill stays locked. Open Work to review the Final Check.";
  state.jobs = [job, second]; state.facts = { [job.id]: { ...facts, blocker }, [second.id]: { ...facts, blocker } };
  state.decisions = { ...emptyDecisions, decisions: [{ id: "decision", jobId: job.id, jobLabel: job.title, title: "Review extra", detail: "A builder decision", classification: "mandatory", resolution: "open" }] };
  const html = renderToStaticMarkup(<Today workspace={workspace}/>);
  expect(html).toMatch(/<strong>2<\/strong><small[^>]*>jobs need attention/u);
  expect(html).toContain("View all (2 jobs)");
  expect(html.match(/Final Check failed/g)).toHaveLength(2);
  expect(html).toContain("Review extra: A builder decision");
  for (const current of state.jobs) expect(html).toContain(current.title);
  state.facts[second.id] = unavailableFacts;
  const partial = renderToStaticMarkup(<Today workspace={workspace}/>);
  expect(partial).toContain("Final Check failed");
  expect(partial).toContain("Some job checks could not be loaded");
  expect(partial).not.toContain("No immediate action");
});
it("only reports no immediate action when every required check succeeded", () => {
  state.jobs = [job]; state.facts = { [job.id]: facts }; state.decisions = emptyDecisions;
  expect(renderToStaticMarkup(<Today workspace={workspace}/>)).toContain("No immediate action");
  state.decisions = null;
  expect(renderToStaticMarkup(<Today workspace={workspace}/>)).not.toContain("No immediate action");
});
it.each([null, undefined, 0, 480000])("keeps absent, unavailable and saved acceptance distinct (%s)", agreed => {
  expect(agreedLine({ ...facts, agreed })).toBe(agreed === null ? "Nothing currently agreed" : agreed === undefined ? "Agreed total unavailable" : `Agreed £${agreed === 0 ? "0.00" : "4,800.00"}`);
});
const lock = (status: "pending" | "failed" | "completed" | null, guard: "FINAL_CHECK_NOT_COMPLETE" | "FINAL_CHECK_FAILED" | null) => ({
  version: "final-account-lock.view.v1", jobId: job.id, lock: { id: job.id, tenantId: job.tenantId, jobId: job.id }, checkStatus: status, invoiceGuard: guard,
});
it.each([
  ["pending", "FINAL_CHECK_NOT_COMPLETE", "Waiting for the Final Check"],
  ["failed", "FINAL_CHECK_FAILED", "Final Check failed"],
  ["completed", null, null],
  [null, "FINAL_CHECK_NOT_COMPLETE", "Waiting for the Final Check"],
] as const)("projects %s checks from builder-visible lock metadata", (status, guard, expected) => {
  const result = projectBillCheck(lock(status, guard), job.id, job.tenantId);
  if (expected === null) expect(result).toBeNull(); else expect(result).toContain(expected);
});
it("rejects a substituted lock job or workspace and never uses signal or reveal counts", () => {
  expect(() => projectBillCheck(lock("failed", "FINAL_CHECK_FAILED"), "other-job", job.tenantId)).toThrow();
  expect(() => projectBillCheck(lock("failed", "FINAL_CHECK_FAILED"), job.id, "other-firm")).toThrow();
  expect(projectBillCheck({ ...lock("completed", null), hiddenSignals: 99, revealItems: [1, 2] }, job.id, job.tenantId)).toBeNull();
  expect(attentionJobs([job], emptyDecisions, { [job.id]: facts })).toEqual([]);
});
function response(body: unknown, status = 200) { return { ok: status === 200, status, json: async () => body } as Response; }
it.each(["focus", "job-saved", "job-lifecycle-changed", "jobguard:invoice-changed"])("keeps Work mounted during a %s refresh and clears it on denied access", async event => {
 const events = new EventTarget(); vi.stubGlobal("window", events);
 const fetch = vi.fn(async (url: string) => response(url.includes("?tenantId=")
  ? { version: 1, tenantId: job.tenantId, jobs: [job] }
  : { version: 1, environment: "synthetic_demo", job: detailJob }));
 vi.stubGlobal("fetch", fetch); hooks.active = true;
 const render = (id = job.id, tenantId = job.tenantId) => {
  hooks.render(); const result = useJobDetail(id, tenantId); hooks.flush(); return result;
 };
 expect(render().detail).toBeNull();
 await vi.waitFor(() => expect(render().detail?.job.id).toBe(job.id));
 const saved = render().detail;
 let release!: (value: Response) => void;
 fetch.mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
 events.dispatchEvent(event === "focus" ? new Event(event) : new CustomEvent(event, { detail: { jobId: job.id } }));
 expect(render().detail).toBe(saved);
 // A second render observes state updates queued by the refresh effect.
 expect(render().detail).toBe(saved);
 release(response({}, 403));
 await vi.waitFor(() => expect(render()).toMatchObject({ detail: null, failed: "forbidden" }));
});
it("hides the previous job immediately when the job or tenant changes", async () => {
 vi.stubGlobal("window", new EventTarget());
 vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.includes("?tenantId=")
  ? { version: 1, tenantId: job.tenantId, jobs: [job] }
  : { version: 1, environment: "synthetic_demo", job: detailJob })));
 hooks.active = true;
 const render = (id = job.id, tenant = job.tenantId) => {
  hooks.render(); const result = useJobDetail(id, tenant); hooks.flush(); return result;
 };
 render(); await vi.waitFor(() => expect(render().detail?.job.id).toBe(job.id));
 expect(render("10000000-0000-4000-8000-000000000002").detail).toBeNull();
 expect(render(job.id, "20000000-0000-4000-8000-000000000002").detail).toBeNull();
});
const invoice = { id: job.id, number: "P-1", issuedOn: "2026-11-10", recipient: "fictional@example.invalid", pdfSha256: "a".repeat(64), finalAccountRevisionId: job.id, sourceHash: "a".repeat(64), netPence: 90000, taxPence: 18000, totalPence: 108000, balancePence: 0, customerCreditPence: 0, paidPence: 108000, creditedPence: 0, delivery: "simulated_delivery" };
function reads(overrides: Record<string, Response> = {}) {
  return vi.fn(async (url: string) => {
    const route = url.replace(`/api/jobs/${job.id}`, "");
    if (overrides[route]) return overrides[route]!;
    const bodies: Record<string, unknown> = {
      "": { version: 1, environment: "synthetic_demo", job: detailJob },
      "/quotes/acceptance": { version: 1, environment: "synthetic_demo", jobId: job.id, activeAcceptance: { totalPence: 108000 }, currentDocument: { totalPence: 999999 } },
      "/customer-invoices": { version: 1, environment: "synthetic_demo", jobId: job.id, invoices: [invoice] },
      "/value": { version: "job-value.v1", environment: "synthetic_demo", jobId: job.id, approvedExtras: { pence: null }, invoicedGross: { pence: 108000 }, recordedGross: { pence: 108000 }, outstandingGross: { pence: 0 }, pendingExtras: [] },
      "/final-account/lock": lock("completed", null),
    };
    return response(bodies[route]);
  });
}
it.each([
  ["paid", { paidPence: 108000, creditedPence: 0, balancePence: 0 }],
  ["part_paid", { paidPence: 50000, creditedPence: 0, balancePence: 58000 }],
  ["unpaid", { paidPence: 0, creditedPence: 0, balancePence: 108000 }], // reversed receipt
  ["credited", { paidPence: 0, creditedPence: 108000, balancePence: 0 }],
] as const)("uses saved receipts and credits for %s without changing agreed money", async (expected, amounts) => {
  vi.stubGlobal("fetch", reads({ "/customer-invoices": response({ version: 1, environment: "synthetic_demo", jobId: job.id, invoices: [{ ...invoice, ...amounts }] }) }));
  const result = await readJobFacts(job.id, job.tenantId);
  expect(result.payment?.state).toBe(expected); expect(result.agreed).toBe(108000);
});
it("uses every saved invoice, including an older outstanding balance", async () => {
  vi.stubGlobal("fetch", reads({ "/customer-invoices": response({ version: 1, environment: "synthetic_demo", jobId: job.id, invoices: [{ ...invoice, id: "10000000-0000-4000-8000-000000000002", balancePence: 108000, paidPence: 0 }, invoice] }) }));
  expect((await readJobFacts(job.id, job.tenantId)).payment?.state).toBe("part_paid");
});
it("treats cancelled acceptance as nothing currently agreed and a failed read as unavailable", async () => {
  vi.stubGlobal("fetch", reads({ "/quotes/acceptance": response({ version: 1, environment: "synthetic_demo", jobId: job.id, activeAcceptance: null }) }));
  expect((await readJobFacts(job.id, job.tenantId)).agreed).toBeNull();
  vi.stubGlobal("fetch", reads({ "/quotes/acceptance": response({}, 503) }));
  const failed = await readJobFacts(job.id, job.tenantId);
  expect(failed.agreed).toBeUndefined(); expect(failed.checksAvailable).toBe(false);
});
it.each([401, 403, 404])("clears all facts after a revoked/reset session (%s)", async status => {
  vi.stubGlobal("fetch", reads({ "/quotes/acceptance": response({}, status) }));
  expect(await readJobFacts(job.id, job.tenantId)).toEqual(unavailableFacts);
});
it("refuses cross-firm job substitution before requesting money", async () => {
  const fetch = reads(); vi.stubGlobal("fetch", fetch);
  await expect(readJobFacts(job.id, "20000000-0000-4000-8000-000000000002")).rejects.toThrow("WRONG_JOB_RESPONSE");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(["/quotes/acceptance", "/customer-invoices", "/value", "/final-account/lock"])("rejects the wrong job in %s", async route => {
  const normal = reads();
  const original = await (await normal(`/api/jobs/${job.id}${route}`)).json();
  vi.stubGlobal("fetch", reads({ [route]: response({ ...original, jobId: "10000000-0000-4000-8000-000000000002" }) }));
  const result = await readJobFacts(job.id, job.tenantId);
  expect(result.checksAvailable).toBe(false);
  if (route === "/quotes/acceptance") expect(result.agreed).toBeUndefined();
  if (route === "/customer-invoices") expect(result.payment).toBeNull();
});
it("discards a late cross-workspace response, refreshes only matching job events, and cleans up listeners", async () => {
  const actual = await vi.importActual<typeof import("./designed-ui")>("./designed-ui");
  const events = new EventTarget(); vi.stubGlobal("window", events);
  let release!: (response: Response) => void;
  const delayed = new Promise<Response>(resolve => { release = resolve; });
  const normal = reads();
  const fetch = vi.fn((url: string) => url.endsWith("/quotes/acceptance") ? delayed : normal(url));
  vi.stubGlobal("fetch", fetch); hooks.active = true;
  const render = (tenant: string) => { hooks.render(); const result = actual.useJobFacts(tenant, [job.id]); hooks.flush(); return result; };
  expect(render(job.tenantId)).toBeNull();
  await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith("/quotes/acceptance"))).toBe(true));
  expect(render("20000000-0000-4000-8000-000000000002")).toBeNull();
  release(response({ version: 1, environment: "synthetic_demo", jobId: job.id, activeAcceptance: { totalPence: 108000 } }));
  await vi.waitFor(() => expect(render("20000000-0000-4000-8000-000000000002")?.[job.id]).toEqual(unavailableFacts));
  expect(render(job.tenantId)).toBeNull();
  await vi.waitFor(() => expect(render(job.tenantId)?.[job.id]?.agreed).toBe(108000));
  const before = fetch.mock.calls.length;
  events.dispatchEvent(new CustomEvent("job-saved", { detail: { jobId: "other" } }));
  expect(fetch).toHaveBeenCalledTimes(before);
  for (const event of ["focus", "job-saved", "job-lifecycle-changed", "jobguard:invoice-changed"]) {
    events.dispatchEvent(event === "focus" ? new Event(event) : new CustomEvent(event, { detail: event === "job-lifecycle-changed" ? job.id : { jobId: job.id } }));
    expect(render(job.tenantId)).toBeNull();
    await vi.waitFor(() => expect(render(job.tenantId)?.[job.id]?.agreed).toBe(108000));
  }
  hooks.reset(); const after = fetch.mock.calls.length;
  events.dispatchEvent(new Event("focus")); expect(fetch).toHaveBeenCalledTimes(after);
});

it("rejects a supplied foreign tenant even when the job ID matches", async () => {
  vi.stubGlobal("fetch", reads({ "/quotes/acceptance": response({ version: 1, environment: "synthetic_demo", jobId: job.id, tenantId: "20000000-0000-4000-8000-000000000002", activeAcceptance: { totalPence: 999999 } }) }));
  const result = await readJobFacts(job.id, job.tenantId);
  expect(result.agreed).toBeUndefined(); expect(result.checksAvailable).toBe(false);
});
it.each(["pending", "failed", "completed"] as const)("renders a %s Final Check on overview with the same interpretation as Today", status => {
  const blocker = projectBillCheck(lock(status, status === "pending" ? "FINAL_CHECK_NOT_COMPLETE" : status === "failed" ? "FINAL_CHECK_FAILED" : null), job.id, job.tenantId);
  const html = renderToStaticMarkup(<Overview site="Site" detail={{ job: detailJob, summary: job, value: null, checks: blocker ? 1 : 0, photo: "", facts: { ...facts, blocker }, attentionReasons: blocker ? [blocker] : [], attentionComplete: true }}/>);
  if (blocker) { expect(html).toContain(blocker); expect(html).toContain(`/jobs/${job.id}/work#final-account-title`); }
  else expect(html).not.toContain("this bill stays locked");
});

it("paid main bill still flags an approved unbilled catch", () => {
  const catchId = "30000000-0000-4000-8000-000000000001";
  const value = { version: "job-value.v1", environment: "synthetic_demo", jobId: job.id, approvedExtras: { pence: 15000 }, invoicedGross: { pence: 108000 }, recordedGross: { pence: 108000 }, outstandingGross: { pence: 0 }, pendingExtras: [], foundAfterLock: [], catchAttention: [{ id: catchId, description: "Painted the kitchen ceiling", revisionId: catchId, revision: 1, pence: 15000, status: "ready_to_invoice", href: `/jobs/${job.id}/work#variation-${catchId}` }] } as NonNullable<JobFacts["value"]>;
  const paid = { ...facts, payment: { state: "paid", label: "Customer paid", paymentStatus: "Paid", invoiceCount: 1 } as const, value };
  state.jobs = [{ ...job, status: "live" }]; state.facts = { [job.id]: paid }; state.decisions = emptyDecisions;
  const html = renderToStaticMarkup(<Today workspace={workspace}/>);
  expect(html).toContain("£150.00 net approved extra not yet invoiced");
  expect(html).toContain(`/jobs/${job.id}/work#variation-${catchId}`);
  expect(html).not.toContain("£150 owed");
});
it("loading Today is not a failed check", () => {
  state.jobs = [job]; state.facts = null; state.decisions = null;
  const html = renderToStaticMarkup(<Today workspace={workspace}/>);
  expect(html).toContain("Loading job checks");
  expect(html).not.toContain("Some job checks could not be loaded");
});

it("paid saved invoices offer the money trail without claiming site completion", () => {
 const saved = { ...facts, payment: { state: "paid", label: "Customer paid", paymentStatus: "Paid", invoiceCount: 1 } as const };
 const html = renderToStaticMarkup(<Overview site="Site" detail={{ job: { ...detailJob, status: "live" }, summary: job, value: null, checks: 0, photo: "", facts: saved, attentionComplete: true }}/>);
 expect(html).toContain("See the money trail");
 expect(html).toContain("Payment alone does not confirm that site work is finished");
 expect(html).not.toContain("Record the work");
});
it.each(["credited", "zero_balance", "settled", "unpaid"] as const)("does not infer payment from %s", state => {
 const saved = { ...facts, payment: { state, label: state, paymentStatus: state, invoiceCount: 1 } };
 const html = renderToStaticMarkup(<Overview site="Site" detail={{ job: { ...detailJob, status: "live" }, summary: job, value: null, checks: 0, photo: "", facts: saved, attentionComplete: true }}/>);
 expect(html).not.toContain("Customer invoices paid");
});
it("validates catch fields and keeps unknown amounts separate from proposals and approvals", () => {
 const id = "30000000-0000-4000-8000-000000000001";
 const base = { id, description: "Ceiling", revisionId: null, revision: null, pence: null, href: `/jobs/${job.id}/work#variation-${id}` };
 expect(catchLabel({ ...base, status: "needs_price" })).toBe("Needs a price: Ceiling");
 expect(catchLabel({ ...base, status: "needs_approval", revisionId: id, revision: 1, pence: 15000 })).toContain("£150.00 net proposed price awaiting approval");
 const value = { version: "job-value.v1", environment: "synthetic_demo", jobId: job.id, approvedExtras: { pence: null }, invoicedGross: { pence: null }, recordedGross: { pence: null }, outstandingGross: { pence: null }, pendingExtras: [], foundAfterLock: [{ ...base, sourceSignalId: id, approved: false }], catchAttention: [{ ...base, status: "needs_price" }] };
 expect(jobValueV1.parse(value).foundAfterLock).toHaveLength(1);
 expect(jobValueV1.safeParse({ ...value, catchAttention: [{ ...base, status: "ready_to_invoice" }] }).success).toBe(false);
 expect(jobValueV1.safeParse({ ...value, foundAfterLock: [{ ...base, sourceSignalId: "bad", approved: true }] }).success).toBe(false);
});
it("completed failed Today reads remain explicit and never produce an all-clear", () => {
 state.jobs = [job]; state.facts = { [job.id]: unavailableFacts }; state.decisions = emptyDecisions;
 const html = renderToStaticMarkup(<Today workspace={workspace}/>);
 expect(html).toContain("Some job checks could not be loaded");
 expect(html).not.toContain("Loading job checks"); expect(html).not.toContain("No immediate action");
});
it("catch actions retain independent decision and bill blocker links", () => {
 const id = "30000000-0000-4000-8000-000000000001";
 const value = jobValueV1.parse({ version: "job-value.v1", environment: "synthetic_demo", jobId: job.id, approvedExtras: { pence: null }, invoicedGross: { pence: null }, recordedGross: { pence: null }, outstandingGross: { pence: null }, pendingExtras: [], catchAttention: [{ id, description: "Ceiling", revisionId: null, revision: null, pence: null, status: "needs_price", href: `/jobs/${job.id}/work#variation-${id}` }] });
 const decisions = { ...emptyDecisions, decisions: [{ id, jobId: job.id, jobLabel: job.title, title: "Decision", detail: "Review", classification: "mandatory" as const, resolution: "open" }] };
 const result = attentionJobs([job], decisions, { [job.id]: { ...facts, value, blocker: "Waiting for the Final Check" } })[0]!;
 expect(result.links.map(row => row.href)).toEqual([`/jobs/${job.id}/work#variation-${id}`, `/jobs/${job.id}/work#final-account-title`, `/jobs/${job.id}/work#final-account-title`]);
 expect(result.reasons).toHaveLength(3);
});
it.each(["foundAfterLock", "catchAttention"])("rejects a foreign catch link in %s", async field => {
 const normal = reads(), raw = await (await normal(`/api/jobs/${job.id}/value`)).json();
 const id = "30000000-0000-4000-8000-000000000001";
 const row = field === "foundAfterLock" ? { id, description: "Ceiling", revisionId: null, revision: null, pence: null, approved: false, sourceSignalId: id, href: `/jobs/other/work#variation-${id}` } : { id, description: "Ceiling", revisionId: null, revision: null, pence: null, status: "needs_price", href: `/jobs/other/work#variation-${id}` };
 vi.stubGlobal("fetch", reads({ "/value": response({ ...raw, [field]: [row] }) }));
 const result = await readJobFacts(job.id, job.tenantId);
 expect(result.value).toBeNull(); expect(result.checksAvailable).toBe(false);
});

it("attention reads distinguish initial progress, successful empty results and completed failure", async () => {
 const actual = await vi.importActual<typeof import("./designed-ui")>("./designed-ui");
 const events = new EventTarget(); vi.stubGlobal("window", events);
 let release!: (value: Response) => void;
 const delayed = new Promise<Response>(resolve => { release = resolve; });
 vi.stubGlobal("fetch", vi.fn(() => delayed)); hooks.active = true;
 const render = () => { hooks.render(); const result = actual.useAttention(workspace, [], {}); hooks.flush(); return result; };
 expect(render()).toMatchObject({ loading: true, failed: false, complete: false, items: [] });
 release(response(emptyDecisions));
 await vi.waitFor(() => expect(render()).toMatchObject({ loading: false, failed: false, complete: true, items: [] }));
 vi.stubGlobal("fetch", vi.fn(async () => response({}, 503)));
 events.dispatchEvent(new Event("focus"));
 expect(render()).toMatchObject({ loading: true, failed: false, complete: false });
 await vi.waitFor(() => expect(render()).toMatchObject({ loading: false, failed: true, complete: false }));
});
it("obsolete fact reads are aborted when the workspace changes", async () => {
 const actual = await vi.importActual<typeof import("./designed-ui")>("./designed-ui");
 vi.stubGlobal("window", new EventTarget());
 const signals: AbortSignal[] = [];
 vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
  signals.push(options.signal as AbortSignal);
  return new Promise<Response>(() => {});
 })); hooks.active = true;
 const render = (tenant: string) => { hooks.render(); const result = actual.useJobFacts(tenant, [job.id]); hooks.flush(); return result; };
 expect(render(job.tenantId)).toBeNull();
 expect(signals[0]?.aborted).toBe(false);
 expect(render("20000000-0000-4000-8000-000000000002")).toBeNull();
 expect(signals[0]?.aborted).toBe(true);
 expect(signals[1]?.aborted).toBe(false);
});
