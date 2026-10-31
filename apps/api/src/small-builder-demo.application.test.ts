import { describe, expect, it, vi } from "vitest";
import {
  smallBuilderDemoCreateV1,
  smallBuilderDemoResetV1,
  smallBuilderDemoReportSnapshotV1,
  smallBuilderDemoReadRunV1,
  smallBuilderDemoReadReportV1,
} from "./small-builder-demo.contracts.js";

import { SmallBuilderDemoApplication,SmallBuilderTrialDemoApplication } from "./small-builder-demo.application.js";
// Request-boundary tests; persisted lifecycle adversaries are in the PostgreSQL suite.
const id = "d1500000-0000-4000-8000-000000000001";
const create = { contractVersion: "small-builder-demo.create.v1", commandId: id, scenario: "core-1000" };
const reset = { contractVersion: "small-builder-demo.reset.v1", commandId: id, expectedRunRevision: 1 };
const snapshot = { ...reset, contractVersion: "small-builder-demo.report-snapshot.v1" };
const commands = [
  { schema: smallBuilderDemoCreateV1, input: create },
  { schema: smallBuilderDemoResetV1, input: reset },
  { schema: smallBuilderDemoReportSnapshotV1, input: snapshot },
];

describe("DEMO-I strict request boundary", () => {
  it.each(["core-1000", "recovery-18800", "shadow-30000", "meter", "trial"])(
    "accepts catalogue selection %s without asserting executability (DI2-01 preparation)", scenario => {
      expect(smallBuilderDemoCreateV1.parse({ ...create, scenario })).toEqual({ ...create, scenario });
    },
  );
  it.each(["", "core", "core-1000; DROP TABLE app.job", "constructor", "CORE-1000"])(
    "refuses non-catalogue selection %s", scenario => {
      expect(smallBuilderDemoCreateV1.safeParse({ ...create, scenario }).success).toBe(false);
    },
  );
  for (const { schema, input } of commands) {
    describe(input.contractVersion, () => {
      it("requires its exact version and a metadata command UUID", () => {
        expect(schema.parse(input)).toEqual(input);
        const { commandId: _commandId, ...missingId } = input;
        expect(schema.safeParse(missingId).success).toBe(false);
        for (const commandId of ["", "not-a-uuid", 1, null]) {
          expect(schema.safeParse({ ...input, commandId }).success).toBe(false);
        }
        for (const contractVersion of [undefined, "small-builder-demo.create.v2", "sandbox_command_v1"]) {
          expect(schema.safeParse({ ...input, contractVersion }).success).toBe(false);
        }
      });
      it.each([
        ["tenantId", id], ["sessionId", id], ["actor", id], ["membershipId", id],
        ["environment", "synthetic_demo"], ["authority", { verified: true }],
        ["jobId", id], ["step", 99], ["completed", true], ["amountPence", 100],
        ["fee", 100], ["settlementStatus", "settled"], ["count", 0], ["trial", true],
        ["facts", []], ["receipt", {}], ["sourceVector", []], ["PASS", true],
        ["ci", "https://example.invalid/pass"], ["modelVerdict", "PASS"], ["humanObservation", "PASS"],
        ["expectedValue", 100], ["observedValue", 100], ["disclosedBeforeLock", false],
      ])("rejects client-owned %s (DI1-05 / DI3-01 / DI3-06 / DI3-09 preparation)", (key, value) => {
        expect(schema.safeParse({ ...input, [String(key)]: value }).success).toBe(false);
      });
      it.each([null, [], "", 1, true])("rejects non-object %j", raw => {
        expect(schema.safeParse(raw).success).toBe(false);
      });
    });
  }
  for (const { schema, input } of commands.slice(1)) {
    it(`${input.contractVersion} requires a positive safe expected revision (DI1-03 boundary only)`, () => {
      for (const expectedRunRevision of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, "1"]) {
        expect(schema.safeParse({ ...input, expectedRunRevision }).success).toBe(false);
      }
    });
  }
  it("reset cannot request cancellation, entitlement reuse or deletion (DI1-06 / DI3-11 preparation)", () => {
    for (const key of ["cancelPending", "deleteHistory", "releaseTrialKey", "excludeOldJobsFromMeter", "successorTenantId", "snapshotBeforeReset"]) {
      expect(smallBuilderDemoResetV1.safeParse({ ...reset, [key]: true }).success).toBe(false);
    }
  });
  it("read queries contain only subject locators; no snapshot/write flag (DI3-04 preparation)", () => {
    expect(smallBuilderDemoReadRunV1.parse({ runId: id })).toEqual({ runId: id });
    expect(smallBuilderDemoReadReportV1.parse({ runId: id })).toEqual({ runId: id });
    expect(smallBuilderDemoReadReportV1.parse({ runId: id, snapshotId: id })).toEqual({ runId: id, snapshotId: id });
    for (const schema of [smallBuilderDemoReadRunV1, smallBuilderDemoReadReportV1]) {
      for (const runId of [undefined, "", "not-a-uuid", [], null]) {
        expect(schema.safeParse({ runId }).success).toBe(false);
      }
      for (const key of ["createSnapshot", "commandId", "tenantId", "includeHidden", "archive"]) {
        expect(schema.safeParse({ runId: id, [key]: true }).success).toBe(false);
      }
    }
    expect(smallBuilderDemoReadReportV1.safeParse({ runId: id, snapshotId: "invalid" }).success).toBe(false);
    expect(smallBuilderDemoReadRunV1.safeParse({ runId: id, snapshotId: id }).success).toBe(false);
  });
});

// Company authority tests exercise the real application bridge with a fake storage port.

function lifecycleFixture(environment="synthetic_demo") {
 const credentials={sessionToken:"s".repeat(32),requestedTenantId:id,csrfToken:"c".repeat(24),origin:"https://jobguard.invalid"};
 const provider={authenticate:vi.fn().mockResolvedValue({identityUserId:id,sessionId:id,csrfToken:credentials.csrfToken}),findMembership:vi.fn().mockResolvedValue({id,identityUserId:id,tenantId:id,role:"owner",email:"owner@fictional.invalid"})};
 const authority={provider,allowedOrigin:credentials.origin,environment:()=>environment,resolve:vi.fn().mockResolvedValue({credentials,digest:"a".repeat(64)})};
 const repository={execute:vi.fn().mockResolvedValue({status:"blocked"})};
 return {authority,repository,app:new SmallBuilderDemoApplication(authority as never,repository)};
}
describe("DEMO-I company authority",()=>{
 it("resolves a fresh session digest for the same membership on resume",async()=>{
  const f=lifecycleFixture();
  await f.app.execute("first-login","read",id,{});
  const original=f.authority.resolve.mock.results[0]!;
  const {credentials}=await original.value;
  const freshCredentials={...credentials,sessionToken:"t".repeat(32),csrfToken:"d".repeat(24)};
  f.authority.resolve.mockResolvedValue({credentials:freshCredentials,digest:"b".repeat(64)});
  f.authority.provider.authenticate.mockResolvedValue({identityUserId:id,sessionId:"d1500000-0000-4000-8000-000000000002",csrfToken:freshCredentials.csrfToken});
  await f.app.execute("fresh-login","read",id,{});
  expect(f.authority.provider.authenticate).toHaveBeenCalledTimes(2);
  expect(f.authority.provider.findMembership).toHaveBeenCalledTimes(2);
  expect(f.authority.provider.authenticate).toHaveBeenNthCalledWith(1,credentials.sessionToken);
  expect(f.authority.provider.authenticate).toHaveBeenNthCalledWith(2,freshCredentials.sessionToken);
  expect(f.repository.execute).toHaveBeenNthCalledWith(1,expect.objectContaining({tenantId:id}),"a".repeat(64),"read",id,{});
  expect(f.repository.execute).toHaveBeenNthCalledWith(2,expect.objectContaining({tenantId:id}),"b".repeat(64),"read",id,{});
  f.authority.resolve.mockResolvedValue({credentials:{...freshCredentials,csrfToken:credentials.csrfToken},digest:"b".repeat(64)});
  await expect(f.app.execute("stale-csrf","read",id,{})).rejects.toThrow("DEMO_FORBIDDEN");
  expect(f.repository.execute).toHaveBeenCalledTimes(2);
 });
 it("re-authenticates resume, reset and report reads; a revoked session cannot replay",async()=>{
  const f=lifecycleFixture();
  for(const op of ["read","reset","report"] as const) await f.app.execute("session",op,id,op==="reset"?reset:{});
  expect(f.authority.provider.authenticate).toHaveBeenCalledTimes(3);
  expect(f.authority.provider.findMembership).toHaveBeenCalledTimes(3);
  f.authority.provider.authenticate.mockResolvedValue(null as never);
  await expect(f.app.execute("session","reset",id,reset)).rejects.toThrow("DEMO_FORBIDDEN");
  expect(f.repository.execute).toHaveBeenCalledTimes(3);
 });
 it("refuses production, practice credentials and missing membership before storage",async()=>{
  const production=lifecycleFixture("production");await expect(production.app.execute("session","create",null,create)).rejects.toThrow("DEMO_SYNTHETIC_ONLY");expect(production.repository.execute).not.toHaveBeenCalled();
  const f=lifecycleFixture();f.authority.resolve.mockRejectedValue(new Error("practice cookie"));
  await expect(f.app.execute("practice","read",id)).rejects.toThrow("DEMO_FORBIDDEN");expect(f.repository.execute).not.toHaveBeenCalled();
  const g=lifecycleFixture();g.authority.provider.findMembership.mockResolvedValue(null as never);
  await expect(g.app.execute("session","read",id)).rejects.toThrow("DEMO_FORBIDDEN");expect(g.repository.execute).not.toHaveBeenCalled();
 });
});

describe("DEMO-J5 company authority before trial source reads and replay",()=>{
 it("requires current company membership on every request, including a reused command",async()=>{
  const f=lifecycleFixture(),app=new SmallBuilderTrialDemoApplication(f.authority as never,f.repository);
  const command={version:"trial-demo-command.v1",action:"snapshot",runId:id,commandId:id};
  await app.execute("current",command);await app.execute("current",command);
  expect(f.authority.provider.authenticate).toHaveBeenCalledTimes(2);
  expect(f.repository.execute).toHaveBeenCalledWith(expect.objectContaining({tenantId:id}),"a".repeat(64),command);
  f.authority.provider.authenticate.mockResolvedValue(null as never);
  await expect(app.execute("revoked",command)).rejects.toThrow("DEMO_FORBIDDEN");
  expect(f.repository.execute).toHaveBeenCalledTimes(2);
 });
 it("refuses production and practice credentials before persistence",async()=>{
  const f=lifecycleFixture("production"),app=new SmallBuilderTrialDemoApplication(f.authority as never,f.repository);
  await expect(app.execute("session",{})).rejects.toThrow("DEMO_SYNTHETIC_ONLY");expect(f.repository.execute).not.toHaveBeenCalled();
  const g=lifecycleFixture();g.authority.resolve.mockRejectedValue(new Error("practice cookie"));
  await expect(new SmallBuilderTrialDemoApplication(g.authority as never,g.repository).execute("practice",{})).rejects.toThrow("DEMO_FORBIDDEN");
  expect(g.repository.execute).not.toHaveBeenCalled();
 });
});
