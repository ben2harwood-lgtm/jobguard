import "reflect-metadata";
import { createHmac, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MACHINE_PATH, machineSigningBytes, type MachineAuthority, type MachineRequest } from "./machine.js";

const key = Buffer.alloc(32, 8);
const body = Buffer.from(JSON.stringify({ version: "connector-input.v1", eventId: "fixture:event", subject: "fixture:order", revision: 1, kind: "work_order", document: "fixture:doc" }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });

async function boot(enabled: boolean) {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  if (enabled) vi.stubEnv("JOBGUARD_CONNECTOR_MACHINE", "synthetic");
  else delete process.env.JOBGUARD_CONNECTOR_MACHINE;
  const { AppModule } = await import("../app.module.js");
  const { MachineModule } = await import("./machine.module.js");
  const { Pool } = await import("pg");
  const { FictionalMachineManagement } = await import("./machine-management.js");
  const id = randomUUID(), tenantId = randomUUID();
  const authority: MachineAuthority = { tenantId, environment: "synthetic_demo", clientContract: "fixture:client", machineActor: randomUUID(), capabilityVersion: 1, capabilities: ["work_order"], keyRefs: ["fixture:key", "fixture:unknown"] };
  const query = vi.fn(async (sql: string) => ({ rows: [{ value: sql.includes("machine_authority") ? authority : { state: "staged", domainEffects: 0 } }] }));
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (enabled) builder.overrideModule(Reflect.getMetadata("imports", AppModule)[0]).useModule(MachineModule.register(process.env, { tokens: new Map([[id, "fictional-db-token"]]), keys: new Map([["fixture:key", key]]) }));
  const module = await builder.overrideProvider(Pool).useValue({})
    .overrideProvider("CONNECTOR_MACHINE_POOL").useValue({ query })
    .overrideProvider("CONNECTOR_MACHINE_MANAGEMENT_POOL").useValue({})
    .overrideProvider(FictionalMachineManagement).useValue({}).compile();
  const app = module.createNestApplication();
  const adapter = app.getHttpAdapter(), post = vi.spyOn(adapter, "post"), notFound = vi.spyOn(adapter, "setNotFoundHandler");
  await app.init();
  const h: MachineRequest = { version: "connector-machine-signature.v1", connectionId: id, tenantId, environment: "synthetic_demo", clientContract: "fixture:client", keyRef: "fixture:key", timestamp: String(Math.floor(Date.now() / 1000)), nonce: "fictional_nonce_0001", signature: "" };
  const sign = () => { h.signature = createHmac("sha256", key).update(machineSigningBytes(h, body)).digest("hex"); return JSON.stringify(h); };
  return { app, adapter, post, notFound, query, h, sign };
}
function response() { return { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn(), getHeader: vi.fn() }; }
function request(header?: string, cookie?: string) {
  return { method: "POST", path: MACHINE_PATH, originalUrl: MACHINE_PATH, headers: { ...(header ? { "x-connector-machine": header } : {}), ...(cookie ? { cookie } : {}) }, rawBody: body };
}
async function invoke(f: Awaited<ReturnType<typeof boot>>, req: ReturnType<typeof request>) {
  const route = f.post.mock.calls.find(([path]) => path === MACHINE_PATH)!;
  expect(route).toBeDefined();
  const res = response(); await route[1](req, res, vi.fn()); return res;
}

describe("ENT-13A registered Nest pipeline (no socket or PostgreSQL proof)", () => {
  it("default application has no machine route and resolves it as 404", async () => {
    const f = await boot(false);
    try {
      expect(f.post.mock.calls.some(([path]) => path === MACHINE_PATH)).toBe(false);
      const res = response();
      // Execute Nest's actual unmatched handler without opening a listener.
      const handler = f.notFound.mock.calls[0]![0];
      await handler(request(), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(404);
    } finally { await f.app.close(); }
  });
  it("signed fixture reaches the existing SQL machine_stage boundary", async () => {
    const f = await boot(true);
    try {
      const res = await invoke(f, request(f.sign()));
      expect(res.json).toHaveBeenCalledWith({ state: "staged", domainEffects: 0 });
      expect(f.query).toHaveBeenCalledWith(expect.stringContaining("connector.machine_stage("), expect.arrayContaining([f.h.connectionId, "fictional-db-token", "fixture:key"]));
    } finally { await f.app.close(); }
  });
  it.each(["fixture:unknown", "env:SECRET"])("refuses key %s before staging", async label => {
    const f = await boot(true);
    try {
      f.h.keyRef = label;
      const res = await invoke(f, request(f.sign()));
      expect(res.status).toHaveBeenCalledWith(401);
      expect(f.query.mock.calls.some(([sql]) => sql.includes("machine_stage"))).toBe(false);
    } finally { await f.app.close(); }
  });
  it.each(["jg_session=00000000-0000-4000-8000-000000000001", "jg_identity_session=fictional-member"])("refuses cookie %s even with a valid signature", async cookie => {
    const f = await boot(true);
    try {
      for (const header of [undefined, f.sign()]) {
        const res = await invoke(f, request(header, cookie));
        expect(res.status).toHaveBeenCalledWith(401);
      }
      expect(f.query).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });
  it.each(["production", "pilot_no_charge", undefined])("refuses application composition in %s", async environment => {
    vi.stubEnv("JOBGUARD_CONNECTOR_MACHINE", "synthetic");
    if (environment) vi.stubEnv("JOBGUARD_ENV", environment); else delete process.env.JOBGUARD_ENV;
    await expect(import("../app.module.js")).rejects.toThrow("Connector configuration is invalid or unavailable");
  });
});
