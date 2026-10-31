import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CommercialIntegrity, LegacyIntegrityResults } from "./commercial-integrity";
import { CommercialIntegrityV3, IntegrityJourney, IntegrityV3Results, integritySnapshotHash, type IntegrityState, type IntegrityV3View } from "./commercial-integrity-v3";
const job = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenant = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const time = "2026-10-20T12:00:00.000001Z", key = "ordinary-invoice";
const family = (value = "v3") => ({ version: "commercial-integrity-family.v1", environment: "synthetic_demo", jobId: job, family: value, realExternalActions: 0 });
function fixture() {
 const source = { tenantId: tenant, jobId: job, scopeId: "private-session", sourceId: "private-source", sourceType: "customer_invoice", revision: "1", hash: "a".repeat(64), recordedAt: time, provenance: "server_recorded" };
 const profile = { version: "synthetic_fixture.persisted-activity.v3", ruleVersion: "persisted-activity.1", window: { start: time, end: time } };
 const snapshot = { version: "commercial-integrity-source-snapshot.v3", tenantId: tenant, jobId: job, scopeId: "private-session", family: "v3", phase: "pre_lock", kind: "invoice_or_payment_without_lock", findingKey: key, profile, window: profile.window, facts: [{ source, activityKind: "invoice" }], compared: { lockState: "absent", activityKind: "invoice" } };
 return { version: "commercial-integrity-view.v3", advisory: true, environment: "synthetic_demo", jobId: job, realExternalActions: 0, notice: "Practice sandbox — synthetic data; nothing is sent or charged", decisionRecord: { id: "D11", status: "proposed", approvalEvidence: null }, feedback: [] as unknown[], availability: ["CI-H3", "CI-H4", "CI-H5"], published: null,
 result: { version: "commercial-integrity-result.v3", advisory: true, syntheticOnly: true, evaluatedAt: time, profileVersion: profile.version, findings: [{ key, kind: snapshot.kind, advisory: true, reason: "Recorded invoice has no final-account lock; interim billing may be legitimate.", sourceReferences: [source], window: profile.window, sourceSnapshot: snapshot }], unavailable: [] } };
}
const legacy = { version: "commercial-integrity-view.v1", environment: "synthetic_demo", decisionRecord: { status: "proposed" }, profile: { version: "commercial_integrity_demo_v1", label: "Example thresholds — not a judgement or billing rule" }, acceptedCapPence: 0, capBasisPence: 0, findings: [] };
const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
function setup(responses: unknown[] = [family(), fixture()]) {
 const states: IntegrityState[] = []; const queue = [...responses];
 const request = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => { const value = queue.shift(); return value instanceof Response ? value : ok(value); });
 const journey = new IntegrityJourney(job.toUpperCase(), state => states.push(state), request as typeof fetch);
 return { journey, request, states, queue, latest: () => states.at(-1)! };
}
function ready(state: IntegrityState): IntegrityV3View { if (state.status !== "v3") throw Error("Expected ready v3"); return state.view; }
describe("CH6-J authoritative family selection and no fixture flash", () => {
 it("renders loading without v1 values, findings or source identifiers", () => {
  const markup = renderToStaticMarkup(<CommercialIntegrity jobId={job} />);
  expect(markup).toContain("Loading recorded sources"); expect(markup).not.toMatch(/£|Frozen accepted|No checks|private-source/u);
 });
 it("routes a server-selected v1 family to the v1 endpoint", async () => {
  const s = setup([family("v1"), legacy]); await s.journey.load(); expect(s.latest().status).toBe("v1");
  expect(s.request.mock.calls.map(c => c[0])).toEqual([`/api/jobs/${job}/commercial-integrity/family`, `/api/jobs/${job}/commercial-integrity`]);
 });
 it("routes a server-selected v3 family to the v3 endpoint with no-store", async () => {
  const s = setup(); await s.journey.load(); expect(s.latest().status).toBe("v3");
  expect(s.request.mock.calls.map(c => c[0])).toEqual([`/api/jobs/${job}/commercial-integrity/family`, `/api/jobs/${job}/commercial-integrity/v3`]);
  expect(s.request.mock.calls.every(c => (c as unknown as [string, RequestInit])[1].cache === "no-store")).toBe(true);
  expect(s.states.map(v => v.status)).toEqual(["loading", "v3"]);
 });
 it.each([ { ...family(), jobId: other }, { ...family(), family: "unknown" }, { ...family(), environment: "production" }, { ...family(), version: "wrong" }, { ...family(), realExternalActions: 1 }, { ...family(), track: "contractor" }, new Response("{}", { status: 503 }) ])("rejects unavailable/contradictory/unsupported family without fallback: %j", async invalid => {
  const s = setup([invalid]); await s.journey.load(); expect(s.latest().status).toBe("error"); expect(s.request).toHaveBeenCalledTimes(1);
 });
 it.each(["job", "feedback-job", "version", "mode", "advisory", "tenant", "scope", "snapshot-job", "snapshot-key", "snapshot-kind", "source-job", "window", "profile", "extra"])("rejects a malformed %s view before rendering", async fault => {
  const raw = fixture();
  if (fault === "job") raw.jobId = other;
  if (fault === "feedback-job") raw.feedback.push({ version: "commercial-integrity-review.v3", commandId: other, findingKey: key, findingSnapshotHash: "a".repeat(64), explanation: "Fictional", outcome: "dismissed_false_positive", jobId: other, recordedAt: time });
  if (fault === "version") raw.version = "commercial-integrity-view.v1";
  if (fault === "mode") raw.environment = "production";
  if (fault === "advisory") raw.advisory = false;
  if (fault === "tenant") raw.result.findings[0]!.sourceReferences[0]!.tenantId = other;
  if (fault === "scope") raw.result.findings[0]!.sourceReferences[0]!.scopeId = "foreign";
  if (fault === "snapshot-job") raw.result.findings[0]!.sourceSnapshot.jobId = other;
  if (fault === "snapshot-key") raw.result.findings[0]!.sourceSnapshot.findingKey = "wrong";
  if (fault === "snapshot-kind") raw.result.findings[0]!.sourceSnapshot.kind = "account_identifier_reuse";
  if (fault === "source-job") raw.result.findings[0]!.sourceReferences[0]!.jobId = other;
  if (fault === "window") raw.result.findings[0]!.window = { start: "2026-10-19T12:00:00.000001Z", end: time };
  if (fault === "profile") raw.result.profileVersion = "synthetic_fixture.other";
  if (fault === "extra") Object.assign(raw, { hiddenCount: 20 });
  // Break reference sharing so tenant/scope faults test a disagreement rather than both changing together.
  if (fault === "tenant" || fault === "scope") { raw.result.findings[0]!.sourceSnapshot.tenantId = tenant; raw.result.findings[0]!.sourceSnapshot.scopeId = "private-session"; }
  const s = setup([family(), raw]); await s.journey.load(); expect(s.latest().status).toBe("error");
 });
 it("compares UUID scope references without case sensitivity", async () => {
  const raw = fixture();
  raw.result.findings[0]!.sourceReferences = [{ ...raw.result.findings[0]!.sourceReferences[0]!, scopeId: tenant.toUpperCase() }];
  raw.result.findings[0]!.sourceSnapshot.scopeId = tenant;
  const s = setup([family(), raw]); await s.journey.load(); expect(s.latest().status).toBe("v3");
 });
 it("invalidates a delayed response on job/session switch and never renders the old state", async () => {
  let release!: (r: Response) => void;
  const s = setup(); s.request.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
  const pending = s.journey.load(); s.journey.clear(); release(ok(family())); await pending;
  expect(s.latest().status).toBe("loading"); expect(s.request).toHaveBeenCalledTimes(1);
 });
 it("invalidates a delayed data response, not just metadata", async () => {
  let release!: (r: Response) => void;
  const s = setup(); s.request.mockImplementationOnce(async () => ok(family())).mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
  const pending = s.journey.load(); await new Promise(resolve => setImmediate(resolve)); s.journey.clear(); release(ok(fixture())); await pending;
  expect(s.latest().status).toBe("loading");
 });
});
describe("CH6-J exact persisted feedback", () => {
 it("retains the command and hash across an uncertain failure; only a persisted read changes dismissal", async () => {
  const s = setup(); await s.journey.load(); const view = ready(s.latest());
  const target = { key, reason: "Review", snapshotHash: view.snapshotHashes[key]! };
  s.queue.push(new Response("{}", { status: 503 })); await expect(s.journey.save(target, "Fictional legitimate interim invoice")).rejects.toThrow();
  expect(ready(s.latest()).feedback).toEqual([]);
  const sent = JSON.parse((s.request.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);
  expect(sent.findingSnapshotHash).toBe(await integritySnapshotHash(view.result.findings[0]!.sourceSnapshot));
  const feedback = { ...sent, jobId: job, recordedAt: time }; const stored = fixture(); stored.feedback.push(feedback);
  s.queue.push(feedback, family(), stored); expect(await s.journey.save(target, "Fictional legitimate interim invoice")).toBe(true);
  const posts = s.request.mock.calls.filter(c => (c as unknown as [string, RequestInit])[1].method === "POST");
  expect(posts).toHaveLength(2); expect(posts[0]).toEqual(posts[1]); expect(ready(s.latest()).feedback).toEqual([feedback]);
  const reopened = setup([family(), stored]); await reopened.journey.load(); expect(ready(reopened.latest()).feedback).toEqual([feedback]);
 });
 it.each([409, 403, 500])("HTTP %s never presents a dismissal as saved", async status => {
  const s = setup(); await s.journey.load(); s.queue.push(new Response("{}", { status }));
  await expect(s.journey.save({ key, reason: "Review", snapshotHash: ready(s.latest()).snapshotHashes[key]! }, "Fictional explanation")).rejects.toThrow();
  expect(ready(s.latest()).feedback).toEqual([]);
 });
 it("rejects missing/forged hashes locally; a forged receipt cannot claim success", async () => {
  const s = setup(); await s.journey.load(); await expect(s.journey.save({ key, reason: "Review" }, "Fictional")).rejects.toThrow(); expect(s.request).toHaveBeenCalledTimes(2);
  s.queue.push({}); await expect(s.journey.save({ key, reason: "Review", snapshotHash: "a".repeat(64) }, "Fictional")).rejects.toThrow(); expect(ready(s.latest()).feedback).toEqual([]);
 });
 it.each(["commandId", "jobId", "findingKey", "findingSnapshotHash", "explanation", "outcome"])("rejects an apparently successful receipt with wrong %s", async field => {
  const s = setup(); await s.journey.load(); const target = { key, reason: "Review", snapshotHash: ready(s.latest()).snapshotHashes[key]! };
  s.request.mockImplementationOnce(async (_url, init) => {
   const sent = JSON.parse(init!.body as string);
   return ok({ ...sent, jobId: job, recordedAt: time, [field]: field === "commandId" || field === "jobId" ? other : "wrong" });
  });
  await expect(s.journey.save(target, "Fictional")).rejects.toThrow(); expect(ready(s.latest()).feedback).toEqual([]);
 });
 it("a double click cannot start two review requests", async () => {
  const s = setup(); await s.journey.load(); const target = { key, reason: "Review", snapshotHash: ready(s.latest()).snapshotHashes[key]! };
  let release!: (r: Response) => void;
  s.request.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
  const first = s.journey.save(target, "Fictional"); expect(await s.journey.save(target, "Fictional")).toBe(false);
  expect(s.request).toHaveBeenCalledTimes(3); s.journey.clear(); release(ok({})); expect(await first).toBe(false);
 });
 it("forbids changing the payload under an uncertain retry key", async () => {
  const s = setup(); await s.journey.load(); const target = { key, reason: "Review", snapshotHash: ready(s.latest()).snapshotHashes[key]! };
  s.queue.push(new Response("{}", { status: 503 })); await expect(s.journey.save(target, "First")).rejects.toThrow();
  await expect(s.journey.save(target, "Changed")).rejects.toThrow(/Reload/u); expect(s.request).toHaveBeenCalledTimes(3);
 });
 it("a session change while saving discards the receipt and dialog authority", async () => {
  const s = setup(); await s.journey.load(); let release!: (r: Response) => void;
  s.request.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
  const pending = s.journey.save({ key, reason: "Review", snapshotHash: ready(s.latest()).snapshotHashes[key]! }, "Fictional");
  s.journey.clear(); release(ok({})); expect(await pending).toBe(false); expect(s.latest().status).toBe("loading");
 });
});
describe("CH6-J safe presentation", () => {
 it("shows source explanations and exact rule/window without identifiers, links or v1 pricing", async () => {
  const s = setup(); await s.journey.load(); const markup = renderToStaticMarkup(<IntegrityV3Results view={ready(s.latest())} open={async () => {}} />);
  expect(markup).toContain("Invoice record"); expect(markup).toContain(time); expect(markup).toContain("persisted-activity.1");
  expect(markup).not.toMatch(/private-session|private-source|aaaaaaaa|bbbbbbbb|href=|cap|plan.credit/iu);
 });
 it("zero ordinary findings remains distinct from an unavailable or complete assessment", async () => {
  const raw = fixture(); raw.result.findings = []; const s = setup([family(), raw]); await s.journey.load();
  const markup = renderToStaticMarkup(<IntegrityV3Results view={ready(s.latest())} open={async () => {}} />);
  expect(markup).toContain("No recorded ordinary findings"); expect(markup).toContain("Unavailable sources have not been assessed");
 });
 it("a historical dismissal for a different source hash does not dismiss current advice", async () => {
  const raw = fixture(); raw.feedback.push({ version: "commercial-integrity-review.v3", commandId: other, jobId: job, recordedAt: time, findingKey: key, findingSnapshotHash: "0".repeat(64), explanation: "Old", outcome: "dismissed_false_positive" });
  const s = setup([family(), raw]); await s.journey.load(); const markup = renderToStaticMarkup(<IntegrityV3Results view={ready(s.latest())} open={async () => {}} />);
  expect(markup).toContain("Review or dismiss"); expect(markup).not.toContain("the saved feedback remains");
 });
});

it("CH-6 installed panel shares the saved-v1 rendering without fabricated pricing", async () => {
 const s = setup([family("v1"), { ...legacy, acceptedCapPence: 1500, capBasisPence: 100000 }]);
 await s.journey.load(); const state = s.latest();
 if (state.status !== "v1") throw Error("Expected saved v1");
 const markup = renderToStaticMarkup(<LegacyIntegrityResults view={state.view} open={async () => {}} />);
 expect(markup).toContain('data-testid="integrity-frozen-accepted-cap">£15.00');
 expect(markup).toContain("£1,000.00 accepted (quoted/final signals do not alter it)");
 expect(markup).toContain("Cap-basis signals are v1-only.");
 expect(markup).not.toContain("£12.00"); expect(markup).not.toContain("Recorded advisory checks · v3");
});
it("CH-6 refuses a hidden publication payload before it enters page state", async () => {
 const raw = { ...fixture(), published: { hiddenSignals: ["private shadow evidence"] } };
 const s = setup([family(), raw]); await s.journey.load(); expect(s.latest().status).toBe("error");
 expect(JSON.stringify(s.states)).not.toMatch(/private shadow evidence|hiddenSignals/u);
});
it("CH-6 renders clear refusals without internal codes or counterfeit successful checks", async () => {
 const raw = fixture(); raw.result.findings = [];
 raw.availability = ["identifier_phone_source_unavailable", "identifier_card_source_unavailable", "credit_line_source_unavailable", "writeoff_line_source_unavailable", "fractional_allocation_source_unavailable", "published_final_check_pending", "receipt_line_source_handoff_unavailable"];
 const s = setup([family(), raw]); await s.journey.load();
 const markup = renderToStaticMarkup(<IntegrityV3Results view={ready(s.latest())} open={async () => {}} />);
 expect(markup).toContain("No authorised phone-sharing source is available.");
 expect(markup).toContain("No authorised card-sharing source is available.");
 expect(markup).toContain("Credit notes have no confirmed-extra line attribution.");
 expect(markup).toContain("The Final Check has not finished.");
 expect(markup).toContain("Exact saved receipt line allocations are unavailable.");
 expect(markup).not.toMatch(/identifier_phone_source_unavailable|CI-H|private-session|hidden/u);
});
it("CH-6 legacy review failure never creates optimistic saved feedback", async () => {
 const s = setup([family("v1"), { ...legacy, findings: [{ key, kind: "example", reason: "Fictional", policyVersion: "v1", sourceReferences: [], citedNumbers: {}, dismissed: false }] }]);
 await s.journey.load(); s.queue.push(new Response("{}", { status: 503 }));
 await expect(s.journey.save({ key, reason: "Fictional" }, "A fictional reason")).rejects.toThrow();
 const state = s.latest(); if (state.status !== "v1") throw Error("Expected saved v1");
 expect(state.view.findings[0]!.dismissed).toBe(false);
});

it("default browser transport calls fetch without an IntegrityJourney receiver",async()=>{
 const states:IntegrityState[]=[];
 vi.stubGlobal("fetch",function(this:unknown,url:RequestInfo|URL){
  // Browser fetch rejects a class instance as its Web IDL receiver.
  if(this!==undefined && this!==globalThis)throw new TypeError("Illegal invocation");
  return Promise.resolve(new Response(JSON.stringify(String(url).endsWith("/family")?family("v1"):legacy)));
 });
 try {await new IntegrityJourney(job,state=>states.push(state)).load();expect(states.at(-1)?.status).toBe("v1");}
 finally {vi.unstubAllGlobals();}
});


it("CH-6 accepts the repository's null draft cap and basis without inventing findings", async () => {
 const s = setup([family("v1"), { ...legacy, acceptedCapPence: null, capBasisPence: null }]);
 await s.journey.load(); const state = s.latest();
 if (state.status !== "v1") throw Error("Expected the saved v1 draft");
 expect(state.view.acceptedCapPence).toBeNull(); expect(state.view.capBasisPence).toBeNull();
 const markup = renderToStaticMarkup(<LegacyIntegrityResults view={state.view} open={async () => {}} />);
 expect(markup).toContain('data-testid="integrity-frozen-accepted-cap">£0.00');
 expect(markup).toContain("£0.00 accepted (quoted/final signals do not alter it)");
 expect(markup).toContain("No checks in this filter."); expect(markup).not.toContain('role="alert"');
});
it.each(["acceptedCapPence", "capBasisPence"])("CH-6 still refuses invalid legacy %s amounts", async field => {
 for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "0", undefined]) {
  const s = setup([family("v1"), { ...legacy, [field]: value }]);
  await s.journey.load(); expect(s.latest().status).toBe("error");
 }
});
