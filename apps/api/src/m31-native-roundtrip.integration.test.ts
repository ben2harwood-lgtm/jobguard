import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { SiteVisitController } from "./contractor/site-visit.controller.js";
import { SiteExtraController } from "./contractor/site-extra.controller.js";
// URL imports keep native/test infrastructure outside the production API compilation root.
const { cluster, siteFixture } = await import(new URL("../../../packages/db/test/site-extra-fixtures.ts", import.meta.url).href);
const { NativeProbe } = await import(new URL("../../mobile/src/sync.ts", import.meta.url).href);
const { localApi } = await import(new URL("../../mobile/src/local-api.ts", import.meta.url).href);
it("M3-1 real loopback API + PostgreSQL: authorized read, queued note, lost response/replay, revoked session", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "http://localhost:3000");
 const c = await cluster(); let app: TestingModule | undefined;
 let closeHttp: (() => Promise<void>) | undefined;
 try {
  const f = await siteFixture(c), actor = f.members.operative.member;
  // Synthetic fixture session only: random per test, digest-bound, never persisted by the client store.
  const token = randomUUID(), digest = createHash("sha256").update(token).digest("hex");
  await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
   SELECT $1,$2,$3,$4,$5,t,t+interval '7 days' FROM (SELECT clock_timestamp() t) r`, [randomUUID(), f.p.tenantId, actor.membershipId, actor.identityUserId, digest]);
  // Vitest transforms do not emit constructor metadata; supply tsc's production injection metadata.
  for (const controller of [SiteVisitController, SiteExtraController]) Reflect.defineMetadata("design:paramtypes", [Pool], controller);
  app = await Test.createTestingModule({ controllers: [SiteVisitController, SiteExtraController], providers: [{ provide: Pool, useValue: c.runtime }] }).compile();
  const http = app.createNestApplication({ logger: false }); closeHttp = () => http.close();
  await http.listen(0, "127.0.0.1");
  const url = await http.getUrl(); let loseResponse = true; const replies: unknown[] = [];
  const authenticated: typeof fetch = async (input, init) => {
   const headers = new Headers(init?.headers); headers.set("Cookie", `jg_session=${token}`);
   const result = await fetch(input, { ...init, headers });
   if (init?.method === "POST") replies.push({ status: result.status, body: await result.clone().json() });
   if (init?.method === "POST" && loseResponse) { loseResponse = false; expect(result.status).toBe(201); throw new Error("Fictional lost response after commit"); }
   return result;
  };
  // Test double ONLY. This proves transport/server behavior, never encryption or native durability.
  let saved: string | null = null;
  const store = { encryption: "sqlcipher", read: async () => saved, write: async (s: string) => { saved = s; }, close: async () => {} };
  const hash = { sha256: async (s: string) => createHash("sha256").update(s).digest("hex") };
  const transport = localApi(url, authenticated), probe = new NativeProbe(store, transport, hash);
  expect((await probe.readAuthorized()).jobs.map((j: { jobId: string }) => j.jobId)).toContain(f.jobId);
  const commandId = "01960000-0000-7000-8000-000000000001";
  await probe.queue({ version: "offline-intent.v1", jobId: f.jobId, clientMetadata: { capturedAt: "2000-01-01T00:00:00Z", hlc: { wallTimeMs: 0, logical: 0, nodeId: "fictional-m31" } }, body: { version: "log-site-extra.v1", commandId, note: "Fictional native compatibility note", description: "Fictional extra" } });
  expect((await probe.roundTrip(0)).status).toBe("queued");
  const restarted = new NativeProbe(store, transport, hash); await restarted.recover();
  expect((await restarted.roundTrip(1000)).status, JSON.stringify(replies)).toBe("recorded");
  const receipt = await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, commandId]);
  expect(receipt.rows[0].n).toBe(1);
  const before = await c.admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, commandId]);
  expect(before.rows[0].n).toBe(1);
  expect(saved).not.toContain(token); expect(saved).not.toContain(digest);
  await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, actor.membershipId]);
  await expect(restarted.readAuthorized()).rejects.toThrow("AUTHORIZED_READ_REFUSED");
  const upload = { version: "offline-upload.v1", jobId: f.jobId, commandId, expectedRevision: null, body: JSON.parse(saved!).intent.body, payloadHash: JSON.parse(saved!).item.payloadHash };
  expect(await transport.upload(upload)).toMatchObject({ state: "rejected", code: "PERMISSION_REVOKED" });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, commandId])).rows[0].n).toBe(1);
 } finally { await closeHttp?.(); await app?.close(); await c.close(); vi.unstubAllEnvs(); }
}, 120_000);
