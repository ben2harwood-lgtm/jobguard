import { subscriptionConsentText } from "@jobguard/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionApplication, subscriptionFailure } from "./subscription.application.js";
const command = { consentText: subscriptionConsentText, version: "subscription-command.v1", kind: "accept", plan: "Solo", cadence: "monthly", anchorDay: 1, termsVersion: "subscription_terms_v1", catalogueVersion: "subscription_pricing_policy_v4", maximumPence: 4900, expectedRevision: 0 };
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function fixture(environment = "synthetic_demo") {
 const repository = { command: vi.fn().mockResolvedValue({ hypothetical: true }), read: vi.fn().mockResolvedValue({ hypothetical: true }) };
 const credentials = { sessionToken: "s".repeat(32), requestedTenantId: id, csrfToken: "c".repeat(24), origin: "https://jobguard.invalid" };
 const provider = { authenticate: vi.fn().mockResolvedValue({ identityUserId: id, sessionId: id, csrfToken: "c".repeat(24) }), findMembership: vi.fn().mockResolvedValue({ id, identityUserId: id, tenantId: id, role: "owner", email: "owner@example.invalid" }) };
 const authority = { provider, allowedOrigin: credentials.origin, environment: () => environment, resolve: vi.fn().mockResolvedValue({ credentials, digest: "a".repeat(64) }) };
 return { repository, authority, app: new SubscriptionApplication(authority as never, repository as never) };
}
describe("subscription application", () => {
 it("server resolves current authority for every call", async () => {
  const f=fixture(); await f.app.command("session",id,command); await f.app.read("session");
  expect(f.authority.resolve).toHaveBeenCalledTimes(2);
  expect(f.authority.provider.authenticate).toHaveBeenCalledTimes(2);
  expect(f.authority.provider.findMembership).toHaveBeenCalledTimes(2);
  f.authority.resolve.mockRejectedValue(new Error("revoked foreign tenant"));
  await expect(f.app.command("session",id,command)).rejects.toThrow("SUBSCRIPTION_UNAVAILABLE");
  expect(f.repository.command).toHaveBeenCalledTimes(1);
 });
 it("client facts cannot authorize a subscription", async () => {
  const f=fixture();
  for(const extra of [{tenantId:id},{actor:id},{executor:true},{price:0}]) await expect(f.app.command("session",id,{...command,...extra})).rejects.toThrow("INVALID_SUBSCRIPTION_INPUT");
  expect(f.repository.command).not.toHaveBeenCalled();
 });
 it("non-synthetic execution refuses", async () => {
  const f=fixture("production"); await expect(f.app.command("session",id,command)).rejects.toThrow("SUBSCRIPTION_SYNTHETIC_ONLY");
  expect(f.repository.command).not.toHaveBeenCalled();
 });
 it("typed failures disclose no foreign company facts", () => {
  expect(subscriptionFailure(new Error("foreign company secret"))).toEqual({version:"subscription-error.v1",code:"SUBSCRIPTION_UNAVAILABLE"});
 });
});

describe("MON-2A C2 public action attacks", () => {
 it("binds the exact terms selection to the authenticated company on the server", async () => {
  const f=fixture(); await f.app.command("session",id,command);
  const {subscriptionTermsContentHash}=await import("@jobguard/db");
  const {version: _v,kind: _k,consentText: _text,...selection}=command;
  const {consentText: _consent,...persisted}=command;
  expect(f.repository.command).toHaveBeenCalledWith(expect.objectContaining({tenantId:id}),"a".repeat(64),id,
   {...persisted,contentHash:subscriptionTermsContentHash(id,selection)});
 });
 it("rejects forged settlement, issuance, annual terms and a wrong maximum", async () => {
  const f=fixture();
  for(const raw of [
   {...command,maximumPence:16900}, {...command,cadence:"annual"}, {...command,contentHash:"a".repeat(64)},
   {version:"subscription-command.v1",kind:"issue",periodStart:"2099-01-01",expectedRevision:0},
   {version:"subscription-command.v1",kind:"record_simulation",workId:id,resultId:id,outcome:"settled",expectedRevision:0},
   {version:"subscription-command.v1",kind:"execute_simulation",workId:id,expectedRevision:0},
  ]) await expect(f.app.command("session",id,raw)).rejects.toThrow("INVALID_SUBSCRIPTION_INPUT");
  expect(f.repository.command).not.toHaveBeenCalled();
 });
 it("Origin, CSRF, expired sessions and foreign membership fail before persistence", async () => {
  for(const patch of [{origin:"https://foreign.invalid"},{csrfToken:"wrong-token-with-at-least-24-characters"},{tenantHeader:id,requestedTenantId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}]) {
   const f=fixture();f.authority.resolve.mockResolvedValue({credentials:{...(await f.authority.resolve()).credentials,...patch},digest:"a".repeat(64)});
   await expect(f.app.command("session",id,command)).rejects.toThrow();expect(f.repository.command).not.toHaveBeenCalled();
  }
  for(const method of ["authenticate","findMembership"] as const) {
   const f=fixture();f.authority.provider[method].mockResolvedValue(null);
   await expect(f.app.command("session",id,command)).rejects.toThrow();expect(f.repository.command).not.toHaveBeenCalled();
  }
 });
 it("approved simulation uses the adapter and records one settlement; replay never executes again", async () => {
  const f=fixture();const workId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const approval={workId,statementId:id,environment:"synthetic_demo",amountPence:4900,contentHash:"a".repeat(64),currency:"GBP",revision:1};
  const snapshot={attempts:[],results:[]} as {attempts:{work_id:string}[];results:unknown[]};
  f.repository.read.mockImplementation(async()=>snapshot);
  f.repository.command.mockImplementation(async(_context,_digest,_id,raw)=>{
   if(raw.kind==="execute_simulation")snapshot.attempts.push({work_id:workId});
   if(raw.kind==="record_simulation")snapshot.results.push({...raw,work_id:workId});
   return raw.kind === "record_simulation" ? {...approval,outcome:raw.outcome} : approval;
  });
  const raw={version:"subscription-command.v1",kind:"approve_simulation",statementId:id,expectedRevision:1,contentHash:"a".repeat(64),amountPence:4900};
  expect(await f.app.command("session",id,raw)).toEqual(approval);
  expect(await f.app.command("session",id,raw)).toEqual(approval);
  expect(snapshot.results).toHaveLength(1);expect(snapshot.results[0]).toMatchObject({outcome:"settled"});
  expect(f.repository.command.mock.calls.map(call=>call[3].kind)).toEqual(["approve_simulation","execute_simulation","record_simulation","approve_simulation"]);
 });
 it("a prior unknown attempt is never retried or presented as settled", async () => {
  const f=fixture();f.repository.command.mockResolvedValue({workId:id});f.repository.read.mockResolvedValue({attempts:[{work_id:id}],results:[]});
  await f.app.command("session",id,{version:"subscription-command.v1",kind:"approve_simulation",statementId:id,expectedRevision:1,contentHash:"a".repeat(64),amountPence:4900});
  expect(f.repository.command).toHaveBeenCalledTimes(1);
 });
});

describe("MON-2A tidy approval failure boundaries", () => {
 const raw={version:"subscription-command.v1",kind:"approve_simulation",statementId:id,expectedRevision:1,contentHash:"a".repeat(64),amountPence:4900};
 it.each(["read", "claim", "record"])("returns saved/pending when %s fails after approval", async failure => {
  const f=fixture();
  f.repository.read.mockImplementation(async()=> {
   if(failure === "read") throw new Error("private failure");
   return {attempts:[],results:[]};
  });
  f.repository.command.mockImplementation(async(_context,_digest,_id,input)=> {
   if(input.kind === "approve_simulation") return {workId:id};
   if(input.kind === "execute_simulation" && failure !== "claim") return {workId:id, statementId:id, environment:"synthetic_demo", amountPence:4900, contentHash:"a".repeat(64),currency:"GBP"};
   throw new Error("private failure");
  });
  expect(await f.app.command("session",id,raw)).toEqual({workId:id,paymentStatus:"pending",executionStatus:"unavailable"});
 });
 it("does not retry execution after a result-recording failure left a durable attempt", async () => {
  const f=fixture();const snapshot={attempts:[] as {work_id:string}[],results:[]};
  f.repository.read.mockResolvedValue(snapshot);
  f.repository.command.mockImplementation(async(_context,_digest,_id,input)=> {
   if(input.kind === "approve_simulation") return {workId:id};
   if(input.kind === "execute_simulation") {
    snapshot.attempts.push({work_id:id});
    return {workId:id,statementId:id,environment:"synthetic_demo",amountPence:4900,contentHash:"a".repeat(64),currency:"GBP"};
   }
   throw new Error("private result-recording failure");
  });
  expect(await f.app.command("session",id,raw)).toEqual({workId:id,paymentStatus:"pending",executionStatus:"unavailable"});
  expect(await f.app.command("session",id,raw)).toEqual({workId:id,paymentStatus:"pending"});
  expect(f.repository.command.mock.calls.map(call=>call[3].kind)).toEqual(["approve_simulation","execute_simulation","record_simulation","approve_simulation"]);
 });
 it("does not present a failed approval as saved", async () => {
  const f=fixture();f.repository.command.mockRejectedValue(new Error("approval rolled back"));
  await expect(f.app.command("session",id,raw)).rejects.toThrow("SUBSCRIPTION_UNAVAILABLE");
  expect(f.repository.read).not.toHaveBeenCalled();
 });
 it.each(["outcome_unknown", "failed", "redirect"])("replay of %s work is pending and never executes again", async outcome => {
  const f=fixture();f.repository.command.mockResolvedValue({workId:id});
  f.repository.read.mockResolvedValue({attempts:[{work_id:id}], results:[{work_id:id,outcome}]});
  for(let i=0;i<2;i++) expect(await f.app.command("session",id,raw)).toEqual({workId:id,paymentStatus:"pending"});
  expect(f.repository.command.mock.calls.map(call=>call[3].kind)).toEqual(["approve_simulation","approve_simulation"]);
 });
 it("rejects missing or changed displayed consent before persistence", async () => {
  const f=fixture();const {consentText:_text,...missing}=command;
  for(const action of [missing,{...command,consentText:subscriptionConsentText+" "}])
   await expect(f.app.command("session",id,action)).rejects.toThrow("INVALID_SUBSCRIPTION_INPUT");
  expect(f.repository.command).not.toHaveBeenCalled();
 });
 it("rechecks company membership on reads and commands, including a revoked selected company", async () => {
  const f=fixture();const foreign="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  f.authority.resolve.mockResolvedValue({credentials:{...(await f.authority.resolve()).credentials,requestedTenantId:foreign},digest:"a".repeat(64)});
  f.authority.provider.findMembership.mockResolvedValue(null);
  await expect(f.app.read("session")).rejects.toThrow("SUBSCRIPTION_FORBIDDEN");
  await expect(f.app.command("session",id,command)).rejects.toThrow("SUBSCRIPTION_FORBIDDEN");
  expect(f.authority.provider.findMembership).toHaveBeenCalledWith(expect.anything(),foreign);
  expect(f.repository.read).not.toHaveBeenCalled();expect(f.repository.command).not.toHaveBeenCalled();
 });
});

// The displayed first anchor comes from the server clock, including London midnight.
afterEach(() => vi.useRealTimers());
it.each([["2026-06-14T23:30:00Z",15],["2026-01-31T12:00:00Z",31],["2024-02-29T12:00:00Z",29]] as const)("returns the server London billing day for %s",async (instant,day)=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(instant));
 expect(await fixture().app.read("session")).toMatchObject({billingDay:day});
});
