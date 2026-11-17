import { describe, expect, it, vi } from "vitest";
import { FreeFirstJobApplication } from "./free-first-job.application.js";
const tenantId = "00000000-0000-4000-8000-000000000001", jobId = "00000000-0000-4000-8000-000000000002";
const eligibility = () => ({ version: "free-first-job-preview.v1", environment: "synthetic_demo", tenantId, jobId,
  identity: { version: "free-first-job-identity.v1", environment: "synthetic_demo", companyNumber: "DEMO0001", normalizedPhone: null, cardFingerprint: null },
  priorLiveJobIds: [] as string[], consumedKeys: [], card: null });
const snapshot = () => ({ version: "free-first-job-read-snapshot.v1", environment: "synthetic_demo", tenantId, jobId, eligibility: eligibility(), timeline: null });
const query = { version: "free-first-job-query.v1" };
function port(value: unknown = snapshot(), environment = "synthetic_demo") {
  return { environment: () => environment, authorizeAndRead: vi.fn(async (_session: unknown, _job: string) => value) };
}
describe("MON-3 application port contract (no database composition)", () => {
  it("[MON3-A19] authority refusal precedes parsing and has identical errors for every job state", async () => {
    const source = port(null), app = new FreeFirstJobApplication(source);
    for (const target of ["unknown", "foreign", "accepted", "live"]) {
      await expect(app.read(undefined, target, { tenantId: "invalid" })).rejects.toMatchObject({ code: "FREE_FIRST_JOB_ACCESS_DENIED" });
    }
    expect(source.authorizeAndRead).toHaveBeenCalledTimes(4);
  });
  it("[MON3-A24] non-synthetic server mode refuses before any read and is rechecked each call", async () => {
    const source = port();
    let environment = "synthetic_demo"; source.environment = () => environment;
    const app = new FreeFirstJobApplication(source);
    expect((await app.read("fictional_session", jobId, query)).hypothetical).toBe(true);
    environment = "production";
    await expect(app.read("fictional_session", jobId, query)).rejects.toMatchObject({ code: "FREE_FIRST_JOB_SYNTHETIC_ONLY" });
    expect(source.authorizeAndRead).toHaveBeenCalledTimes(1);
    for (const mode of ["pilot_no_charge", "", "production"]) await expect(new FreeFirstJobApplication(port(snapshot(), mode)).read(null, jobId, query)).rejects.toThrow("FREE_FIRST_JOB_SYNTHETIC_ONLY");
  });
  it("[MON3-A24] a mode change during the awaited read cannot return a synthetic response", async () => {
    let environment = "synthetic_demo";
    const app = new FreeFirstJobApplication({ environment: () => environment, authorizeAndRead: async () => {
      environment = "production"; return snapshot();
    } });
    await expect(app.read(null, jobId, query)).rejects.toThrow("FREE_FIRST_JOB_SYNTHETIC_ONLY");
  });
  it("[MON3-A20] [MON3-A26] strict query and server snapshot reject authority fields and cross-job bindings", async () => {
    const source = port(), app = new FreeFirstJobApplication(source);
    for (const extra of [{ tenantId }, { approved: true }, { fingerprint: "sim_fp_demo" }, { trial: true }, { version: "v2" }]) {
      await expect(app.read(null, jobId, { ...query, ...extra })).rejects.toThrow("INVALID_FREE_FIRST_JOB_INPUT");
    }
    for (const invalid of [
      { ...snapshot(), jobId: tenantId }, { ...snapshot(), tenantId: jobId },
      { ...snapshot(), environment: "production" }, { ...snapshot(), eligibility: { ...eligibility(), jobId: tenantId } },
      { ...snapshot(), eligibility: { ...eligibility(), tenantId: jobId } },
    ]) await expect(new FreeFirstJobApplication(port(invalid)).read(null, jobId, query)).rejects.toThrow("INVALID_FREE_FIRST_JOB_INPUT");
  });
  it("[MON3-A06] [MON3-A08] read returns Add a card without identity, reference or fingerprint disclosure", async () => {
    const facts = snapshot(); facts.eligibility.priorLiveJobIds = [tenantId];
    const result = await new FreeFirstJobApplication(port(facts)).read("fictional_session", jobId, query);
    expect(result.eligibility).toMatchObject({ cardGate: "card_required", nextAction: "add_card", label: "Add a card" });
    expect(JSON.stringify(result)).not.toMatch(/DEMO0001|sim_ref_|sim_fp_|consumedKeys|normalizedPhone/);
    expect(result).toMatchObject({ hypothetical: true, realExternalActions: 0 });
  });
  it("[MON3-A15] [MON3-A23] each preview reads supplied current facts; no local cache or write exists", async () => {
    const source = port(), app = new FreeFirstJobApplication(source);
    const session = { fictional: "session" };
    await app.read(session, jobId, query); await app.read(session, jobId, query);
    expect(source.authorizeAndRead).toHaveBeenNthCalledWith(1, session, jobId);
    expect(source.authorizeAndRead).toHaveBeenNthCalledWith(2, session, jobId);
  });
});

describe("card request application",()=>{
 it("rechecks authority on every call and never accepts browser completion",async()=>{
  const {FreeFirstJobCardApplication}=await import("./free-first-job.application.js");
  let reads=0;
  const app=new FreeFirstJobCardApplication({environment:()=>"synthetic_demo",authorizeAndRequest:async()=>{reads++;return null;}});
  for(let i=0;i<2;i++)await expect(app.request("session","command",{version:"trial-card-request.v1",status:"completed"})).rejects.toThrow("FREE_FIRST_JOB_ACCESS_DENIED");
  expect(reads).toBe(2);
 });
 it("denies a server mode change across the awaited request",async()=>{
  const {FreeFirstJobCardApplication}=await import("./free-first-job.application.js");
  let mode="synthetic_demo";
  const app=new FreeFirstJobCardApplication({environment:()=>mode,authorizeAndRequest:async()=>{mode="production";return null;}});
  await expect(app.request("session","command",{})).rejects.toThrow("FREE_FIRST_JOB_SYNTHETIC_ONLY");
 });
});
