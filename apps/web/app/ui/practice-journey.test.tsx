import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { PracticeJourney } from "./practice-journey";

// Reuse the job-sources/job-parties hook harness to run the real read and render.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[] = [];
  const effects: (() => void)[] = [];
  return {
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index]!.value, (value: unknown) => { slots[index]!.value = value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn: unknown, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) slots[index] = { value: fn, deps };
      return slots[index]!.value;
    },
    useEffect(fn: () => (() => void) | void, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) {
        slots[index] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[index]!.cleanup = fn() || undefined; });
      }
    },
  };
});
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(), ...hooks }));
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });

const jobId = "11111111-1111-4111-8111-111111111111";
const otherJobId = "22222222-2222-4222-8222-222222222222";
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function journey(status: string, variationStatus = 400, variationCode = "ACTIVATION_REQUIRED", invoiceJobId = jobId, overrides: Record<string, { body: unknown; status: number }> = {}) {
  vi.stubGlobal("React", React);
  const fetch = vi.fn(async (path: string) => {
    const override = overrides[path.split("/").at(-1)!];
    if (override) return response(override.body, override.status);
    if (path.endsWith("/proof")) return response({ version: "practice-proof-view.v1", environment: "synthetic_demo", jobId, completion: null, realExternalActions: 0 });
    if (path.endsWith("/variations")) return response({ code: variationCode }, variationStatus);
    if (path.endsWith("/customer-invoices")) return response({ version: 1, environment: "synthetic_demo", jobId: invoiceJobId, invoices: [] });
    if (path.endsWith("/proposal")) return response({ version: 1, environment: "synthetic_demo", jobId, captureId: jobId, proposalId: jobId, reviewId: jobId, status, source: { text: "Fictional", kind: "text", version: 1, acquisition: null, audioByteLength: 0 }, proposal: { title: "Fictional", lines: [], questions: [] }, review: null });
    if (path.endsWith("/quotes")) return response({ version: 1, environment: "synthetic_demo", jobId, scope: [], draft: null, revisions: [] });
    if (path.endsWith("/fee-illustration")) return response({ code: "NOT_FOUND" }, 404);
    if (path.endsWith("/delivery")) return response(null);
    if (path.endsWith("/final-account")) return response({ version: 1, environment: "synthetic_demo", jobId, account: null });
    if (path.endsWith("/lock")) return response({ version: "final-account-lock.view.v1", jobId, lock: null });
    if (path.endsWith("/final-check")) return response({ state: "unlocked", items: [] });
    throw new Error(`Unexpected read ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  const render = (id = jobId, savedStatus = status) => { hooks.render(); const tree = PracticeJourney({ jobId: id, status: savedStatus }); hooks.effects(); return renderToStaticMarkup(tree); };
  expect(render()).toContain("Checking saved progress");
  await new Promise<void>(resolve => setImmediate(resolve));
  return { html: render(), fetch, render };
}

it.each(["draft", "quoting", "accepted", "lost"])("allows documented activation absence for a %s job", async status => {
  const { html, fetch } = await journey(status);
  expect(html).toContain("Continue this job");
  expect(html).not.toContain("could not be checked");
  expect(html).not.toContain("Checking saved progress");
  expect(fetch).toHaveBeenCalledTimes(status === "draft" ? 9 : 10);
  if (status === "draft") expect(fetch).not.toHaveBeenCalledWith(`/api/jobs/${jobId}/quotes`, expect.anything());
  expect(fetch).toHaveBeenCalledWith(`/api/jobs/${jobId}/variations`, expect.objectContaining({ cache: "no-store" }));
});

it.each([
  ["live", 400, "ACTIVATION_REQUIRED"],
  ["lost", 503, "ACTIVATION_REQUIRED"],
  ["lost", 400, "DATABASE_UNAVAILABLE"],
])("refuses unexpected variations absence for %s / %s / %s", async (status, code, body) => {
  const { html } = await journey(status, code, body);
  expect(html).toContain("Saved progress could not be checked");
  expect(html).not.toContain("journey-customer-balance");
});

it("refuses a wrong-job invoice projection instead of showing progress", async () => {
  const { html } = await journey("accepted", 400, "ACTIVATION_REQUIRED", otherJobId);
  expect(html).toContain("Saved progress could not be checked");
  expect(html).not.toContain("journey-customer-balance");
});

it("still prompts to resolve a found extra before the final customer invoice", async () => {
  const { html, fetch } = await journey("live", 200, "", jobId, {
    proposal: { status: 200, body: {
      version: 1, environment: "synthetic_demo", jobId, captureId: jobId, proposalId: jobId, reviewId: jobId, status: "live",
      source: { text: "Fictional work", kind: "text", version: 1, acquisition: null, audioByteLength: 0 },
      proposal: { title: "Fictional job", lines: [], questions: [] },
      review: { version: "proposal_review_v1", reviewId: jobId, proposalId: jobId, jobId, revision: 1, questions: [], lines: [{
        id: jobId, scopeItemId: jobId, origin: "human", description: "Fictional work", room: "Kitchen", category: "Work",
        quantity: "1", unit: "item", unitPricePence: 1000, disposition: "accepted", dismissalReason: null,
        parentScopeItemIds: [], sourceExcerpt: null,
      }] },
    } },
    proof: { status: 200, body: { version: "practice-proof-view.v1", environment: "synthetic_demo", jobId,
      completion: { id: jobId, reviewRequired: false }, realExternalActions: 0 } },
    variations: { status: 200, body: { version: 1, environment: "synthetic_demo", jobId,
      baselinePence: 1000, capPence: 0, parentScopeItemId: jobId,
      approvedAdditionsPence: 0, approvedOmissionsPence: 0, pendingExtrasPence: 0,
      variations: [{ id: otherJobId, scopeItemId: otherJobId, existingScopeItemId: null, lineageParentScopeItemId: jobId,
        description: "Found extra", captureText: "Fictional extra work", state: "draft", currentRevisionId: null, revisions: [] }],
    } },
  });
  // /customer-invoices contains final bills and supplements. Interim records
  // belong to /interim-drafts, whose issue path is disabled; they are not fed to the guide.
  expect(fetch).toHaveBeenCalledWith(`/api/jobs/${jobId}/customer-invoices`, expect.anything());
  expect(fetch).not.toHaveBeenCalledWith(`/api/jobs/${jobId}/interim-drafts`, expect.anything());
  expect(html).toContain(`href="#variation-${otherJobId}"`);
  expect(html).toContain("Resolve the pending extra");
  expect(html).not.toContain("Issue the customer invoice");
  expect(html).not.toContain("You finished this practice job");
});

function events() {
 const window = new EventTarget(); vi.stubGlobal("window",window); return window;
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
it("refreshes only matching saved-change events and focus, with string lifecycle details",async()=>{
 const window=events();const {fetch,render}=await journey("accepted");
 expect(fetch).toHaveBeenCalledTimes(10);
 for(const name of ["job-saved","jobguard:invoice-changed","jobguard:final-check-changed"]){
  window.dispatchEvent(new CustomEvent(name,{detail:{jobId:otherJobId}}));expect(fetch).toHaveBeenCalledTimes(10);
 }
 window.dispatchEvent(new CustomEvent("job-lifecycle-changed",{detail:{jobId}}));expect(fetch).toHaveBeenCalledTimes(10);
 const notifications=vi.fn();window.addEventListener("job-saved",notifications);
 for(const [index,name] of ["job-saved","job-lifecycle-changed","jobguard:invoice-changed","jobguard:final-check-changed","focus"].entries()){
  window.dispatchEvent(name==="focus"?new Event(name):new CustomEvent(name,{detail:name==="job-lifecycle-changed"?jobId:{jobId}}));
  await settle();expect(render()).toContain("Continue this job");expect(fetch).toHaveBeenCalledTimes(10*(index+2));
 }
 expect(notifications).toHaveBeenCalledTimes(1); // Only the explicit test event; reads publish nothing.
});
it("clears displayed money after a failed read instead of claiming completion",async()=>{
 const window=events();const {fetch,render}=await journey("accepted");
 fetch.mockImplementation(async()=>response({code:"DATABASE_UNAVAILABLE"},503));
 window.dispatchEvent(new Event("focus"));await settle();
 const html=render();expect(html).toContain("Saved progress could not be checked");expect(html).not.toContain("journey-customer-balance");
});
it.each([401,403,404])("refuses foreign-session/unavailable reads with status %s",async status=>{
 const window=events();const {fetch,render}=await journey("accepted");
 fetch.mockImplementation(async()=>response({code:"NOT_FOUND"},status));window.dispatchEvent(new Event("focus"));await settle();
 expect(render()).toContain("Saved progress could not be checked");
});
it("clears previous-job facts immediately and ignores late other-job replies",async()=>{
 const window=events();const {fetch,render}=await journey("accepted");
 const original=fetch.getMockImplementation()!;const releases:(()=>void)[]=[];
 fetch.mockImplementation(path=>new Promise(resolve=>{releases.push(()=>{void original(path).then(resolve);});}));
 window.dispatchEvent(new Event("focus"));
 expect(render(otherJobId)).toContain("Checking saved progress");
 for(const release of releases.slice(0,10))release();await settle();
 const html=render(otherJobId);expect(html).not.toContain("journey-customer-balance");expect(html).not.toContain("You finished this practice job");
});

const lifecycleAbsences = [
  ["proof", 404, "NOT_FOUND"],
  ["final-check", 403, "FINAL_CHECK_FORBIDDEN"],
] as const;
for (const [endpoint, httpStatus, code] of lifecycleAbsences) {
  it.each(["draft", "quoting", "accepted", "lost"])(`allows documented ${endpoint} absence before activation for %s`, async status => {
    const { html } = await journey(status, 400, "ACTIVATION_REQUIRED", jobId, {
      [endpoint]: { body: { code }, status: httpStatus },
    });
    expect(html).toContain("Continue this job");
    expect(html).not.toContain("could not be checked");
  });
  it.each([
    ["live", httpStatus, { code }],
    ["invoiced", httpStatus, { code }],
    ["paid", httpStatus, { code }],
    ["accepted", 503, { code }],
    ["accepted", 401, { code }],
    ["accepted", httpStatus === 404 ? 403 : 404, { code }],
    ["accepted", httpStatus, { code: "DATABASE_UNAVAILABLE" }],
    ["accepted", httpStatus, { code, unexpected: true }],
  ])(`refuses unexpected ${endpoint} absence for %s / %s / %j`, async (status, refusedStatus, body) => {
    const { html } = await journey(status, 400, "ACTIVATION_REQUIRED", jobId, {
      variations: { status: 200, body: { version: 1, environment: "synthetic_demo", jobId,
        baselinePence: 90000, capPence: 0, parentScopeItemId: jobId,
        approvedAdditionsPence: 0, approvedOmissionsPence: 0, pendingExtrasPence: 0, variations: [] } },
      [endpoint]: { body, status: refusedStatus },
    });
    expect(html).toContain("Saved progress could not be checked");
    expect(html).not.toContain("journey-customer-balance");
  });
}
it.each(["draft", "quoting", "accepted", "lost"])("allows the combined pre-activation absences for %s", async status => {
  const { html } = await journey(status, 400, "ACTIVATION_REQUIRED", jobId, {
    proof: { body: { code: "NOT_FOUND" }, status: 404 },
    "final-check": { body: { code: "FINAL_CHECK_FORBIDDEN" }, status: 403 },
  });
  expect(html).toContain("Continue this job");
  expect(html).not.toContain("could not be checked");
});

it.each([
 [404, {code:"DATABASE_UNAVAILABLE"}], [400, {code:"NOT_FOUND"}],
 [200, null], [200, {version:1}],
])("preserves fee illustration read-health failures without claiming progress: %s / %j", async (status, body) => {
 const {html}=await journey("draft",400,"ACTIVATION_REQUIRED",jobId,{"fee-illustration":{status,body}});
 expect(html).toContain("Saved progress could not be checked");
 expect(html).not.toContain("journey-customer-balance");
});

async function pendingJourneyRead() {
 const window = events(); const { fetch, render } = await journey("accepted");
 const original = fetch.getMockImplementation()!;
 const pending: { signal: AbortSignal; release: () => void }[] = [];
 vi.stubGlobal("fetch", vi.fn((path: string, init: { signal: AbortSignal }) => new Promise(resolve => {
  pending.push({ signal: init.signal, release: () => { void original(path).then(resolve); } });
 })));
 window.dispatchEvent(new Event("focus"));
 return { window, pending, render, fetch };
}
it("lets superseded same-job journey reads finish without publishing their late results", async () => {
 const { window, pending, render } = await pendingJourneyRead();
 window.dispatchEvent(new Event("focus"));
 expect(pending).toHaveLength(20);
 expect(pending[0]!.signal.aborted).toBe(false);
 for (const request of pending.slice(0, 10)) request.release();
 await settle();
 expect(render()).toContain("Checking saved progress");
 for (const request of pending.slice(10)) request.release();
 await settle(); expect(render()).toContain("Continue this job");
});
it("lets unmounted same-job journey reads finish without publishing", async () => {
 const { pending, render } = await pendingJourneyRead();
 hooks.unmount();
 expect(pending.every(request => !request.signal.aborted)).toBe(true);
 for (const request of pending) request.release();
 await settle(); expect(render()).toContain("Checking saved progress");
});
it("still aborts the current journey reads when the job changes", async () => {
 const { pending, render } = await pendingJourneyRead();
 render(otherJobId);
 expect(pending.slice(0, 10).every(request => request.signal.aborted)).toBe(true);
 for (const request of pending.slice(0, 10)) request.release();
 await settle(); expect(render(otherJobId)).not.toContain("journey-customer-balance");
});
it("does not abort journey reads when only the same job status changes", async () => {
 const { pending, render } = await pendingJourneyRead();
 render(jobId, "live");
 expect(pending.slice(0, 10).every(request => !request.signal.aborted)).toBe(true);
 for (const request of pending.slice(0, 10)) request.release();
 await settle(); expect(render(jobId, "live")).toContain("Checking saved progress");
});
