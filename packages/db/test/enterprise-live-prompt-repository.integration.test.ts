import { contractorSessionContext } from "../src/index.js";
// Real PostgreSQL acceptance tests: CI only in the restricted builder environment.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { EnterpriseLivePromptRepository } from "../src/enterprise-live-prompt-repository.js";
import { cluster, promptFixture, completionPhoto, promptSession, ownerTx } from "./enterprise-live-prompt-fixtures.js";
import { command } from "./site-extra-fixtures.js";
import type { Cluster } from "./site-visit-fixtures.js";
import { withTenant } from "../src/tenant-context.js";
import { readStoredCompletionPhoto } from "../src/enterprise-live-prompt-source-reader.js";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 120000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("lists exactly verified uninvalidated same-job completion sources with a narrow shape", async () => {
 const f = await promptFixture(c), foreign = await promptFixture(c), repo = new EnterpriseLivePromptRepository(c.runtime);
 const kept = await completionPhoto(c, f, ["Fictional vent"]), invalid = await completionPhoto(c, f, ["Invalidated"]);
 await completionPhoto(c, foreign, ["Foreign"]);
 await completionPhoto(c, { ...f, jobId: f.otherJob }, ["Other job"]);
 // Owner-only fixture setup models lifecycle states; product runtime never forges verification.
 const pending = await completionPhoto(c, f, ["Pending"]), rejected = await completionPhoto(c, f, ["Rejected"]);
 await ownerTx(c, f.p.tenantId, async db => { await db.$client.query("UPDATE app.evidence_upload SET state='pending',server_verified_at=NULL WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, pending.evidenceId]); });
 await ownerTx(c, f.p.tenantId, async db => { await db.$client.query("UPDATE app.evidence_upload SET state='rejected',rejection_code='TEST_REJECTED' WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, rejected.evidenceId]); });
 await ownerTx(c, f.p.tenantId, async db => { await db.$client.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')", [randomUUID(), f.p.tenantId, invalid.evidenceId, f.p.membershipId]); });
 const result = await repo.observationEvidence(f.sessions.supervisor!, f.jobId) as { version: string; items: Record<string, unknown>[] };
 expect(result.version).toBe("observation-evidence.v1");
 expect(result.items).toEqual([{ ...kept, mediaKind: "completion_photo", photoTags: ["Fictional vent"], capturedAt: null }]);
 expect(Object.keys(result.items[0]!).sort()).toEqual(["capturedAt", "evidenceId", "mediaKind", "objectVersion", "photoTags", "sha256"]);
 for (const role of ["surveyor", "commercial_manager"]) await expect(repo.observationEvidence(f.sessions[role]!, f.jobId)).resolves.toEqual(result);
});
it("rejects foreign, unknown and uncovered jobs, including another supervisor's job", async () => {
 const f = await promptFixture(c), foreign = await promptFixture(c), repo = new EnterpriseLivePromptRepository(c.runtime);
 for (const job of [foreign.jobId, f.otherJob, randomUUID()]) await expect(repo.observationEvidence(f.sessions.supervisor!, job)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
 await expect(repo.observationEvidence(await promptSession(c, f.otherSupervisor), f.jobId)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
});
it("refuses every role refused by the observation command and rechecks revoked grants", async () => {
 const f = await promptFixture(c), repo = new EnterpriseLivePromptRepository(c.runtime);
 for (const role of ["owner", "admin", "finance", "operative", "read_only", "client_approver"]) await expect(repo.observationEvidence(f.sessions[role]!, f.jobId)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
 await expect(repo.observationEvidence(f.sessions.supervisor!, f.jobId)).resolves.toBeDefined();
 await command(c, f, { kind: "grant.revoke", grantId: f.members.supervisor.grant });
 await expect(repo.observationEvidence(f.sessions.supervisor!, f.jobId)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
});
it("binds runtime-read photo bytes to the current session, job, evidence, hash, version and length", async () => {
 const f=await promptFixture(c), foreign=await promptFixture(c), photo=await completionPhoto(c,f,["Fictional vent"]);
 const bytes=await withTenant(c.runtime,await contractorSessionContext(c.runtime,f.sessions.supervisor!),db=>readStoredCompletionPhoto(db,f.sessions.supervisor!,{jobId:f.jobId,...photo}));
 expect(bytes).toBeInstanceOf(Buffer);
 const tags=(session=f.sessions.supervisor!,job=f.jobId,evidence=photo.evidenceId,hash=photo.sha256,version=photo.objectVersion,preimage:Buffer|null=bytes)=>
  // LP-6d: a real session reads as its own bound request; a made-up one binds nothing (f.ctx stays unbound).
  contractorSessionContext(c.runtime,session).catch(()=>f.ctx).then(ctx=>withTenant(c.runtime,ctx,async db=>(await db.$client.query("SELECT app.contractor_completion_photo_tags($1,$2,$3,$4,$5,$6::bytea) tags",[session,job,evidence,hash,version,preimage])).rows[0]!.tags));
 expect(await tags()).toEqual(["Fictional vent"]);
 for(const bad of [Buffer.from(bytes!).fill(0),bytes!.subarray(1),null]) await expect(tags(undefined,undefined,undefined,undefined,undefined,bad)).rejects.toThrow("PROMPT_SOURCE_INVALID");
 await expect(tags(undefined,undefined,undefined,"0".repeat(64))).rejects.toThrow("PROMPT_SOURCE_INVALID");
 await expect(tags(undefined,undefined,undefined,undefined,"wrong-version")).rejects.toThrow("PROMPT_SOURCE_INVALID");
 await expect(tags(undefined,undefined,randomUUID())).rejects.toThrow("PROMPT_SOURCE_INVALID");
 await expect(tags(undefined,foreign.jobId)).rejects.toThrow("EXTRA_FORBIDDEN");
 await expect(tags(f.sessions.operative!)).rejects.toThrow("EXTRA_FORBIDDEN");
 // Raw, class (a): a made-up session binds no request, so the binding check refuses first; nothing is read.
 await expect(tags(randomUUID())).rejects.toThrow("REQUEST_BINDING_REFUSED");
 await ownerTx(c,f.p.tenantId,async db=>{await db.$client.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),f.p.tenantId,photo.evidenceId,f.p.membershipId]);});
 await expect(tags()).rejects.toThrow("PROMPT_SOURCE_INVALID");
 await command(c,f,{kind:"grant.revoke",grantId:f.members.supervisor.grant});
 await expect(tags()).rejects.toThrow("EXTRA_FORBIDDEN");
});
