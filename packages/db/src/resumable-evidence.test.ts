import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResumableEvidenceService } from "./resumable-evidence.js";
import { beginEvidenceUploadSchema, hasCompletePcmWav } from "./evidence.js";
import { verifiedTenantContextFromMembership, verifiedTenantContextForQueuedJob } from "./tenant-context.js";

vi.mock("./watchdog.js", () => ({ requireLiveJob: vi.fn(), commandIdFor: vi.fn(), requestHashFor: vi.fn(),
  claimCommandIdentity: vi.fn(), readCommandIdentity: vi.fn(), findStoredResult: vi.fn(), storeCommandResult: vi.fn() }));
vi.mock("./job-work-state-sources.js", () => ({ refuseLockedNewSource: vi.fn(), checkPostLockSourceLifecycle: vi.fn(), rethrowJobWorkState: (e: unknown) => { throw e; } }));
import { refuseLockedNewSource } from "./job-work-state-sources.js";

const tenant = randomUUID(), user = randomUUID(), member = randomUUID();
const context = verifiedTenantContextFromMembership({ tenantId: tenant, identityUserId: user, membershipId: member } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
const input = { version: "resumable-evidence.v1", uploadId: randomUUID(), jobId: randomUUID(), actorMembershipId: member };
function fixture() {
  let allowed = true;
  const row = { id: input.uploadId, object_key: "synthetic-original", expected_content_type: "image/png",
    expected_sha256: "0".repeat(64), job_id: input.jobId, scope_item_id: randomUUID(),
    object_version_id: null as string|null, device_captured_at: new Date(0), server_received_at: new Date(), maximum_bytes: "4", state: "pending", expires_at: new Date("2099-01-01") };
  const parts: { byte_offset: number; bytes: Buffer }[] = [];
  let original: Record<string,unknown> | undefined;
  let begun = false;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT 1 FROM app.job_commercial_track")) return { rows: allowed &&
      (sql.includes("current_setting") || (values[0]===tenant && values[2]===member && values[3]===user && sql.includes("m.identity_user_id=$4"))) ? [{}] : [] };
    if (sql.startsWith("INSERT INTO app.evidence_upload")) {
      if (!begun) {
        Object.assign(row, { scope_item_id: values[3], expected_sha256: values[5], expected_content_type: values[6],
          maximum_bytes: String(values[7]), retention_class: values[8], device_captured_at: values[9], expires_at: values[10] });
        begun = true;
      }
      return { rows: [row] };
    }
    if (sql.startsWith("SELECT job_id FROM app.evidence_upload")) return {rows:[{job_id:input.jobId}]};
    if (sql.startsWith("SELECT * FROM app.evidence_upload")) return {rows:[row]};
    if (sql.startsWith("SELECT * FROM app.evidence_object")) return {rows:original?[original]:[]};
    if (sql.includes("SET state='quarantined'")) { row.state="quarantined"; row.object_version_id=values[2] as string; }
    if (sql.includes("SET state='verified'")) row.state="verified";
    if (sql.includes("SET state='rejected'")) row.state="rejected";
    if (sql.startsWith("INSERT INTO app.evidence_object")) {
      original={id:input.uploadId,object_version_id:values[6],sha256:values[7],evidence_type:values[4]};
      return {rows:[original]};
    }
    if (sql.includes("FROM app.evidence_upload WHERE")) return { rows: values[1]===input.uploadId && values[2]===input.jobId ? [row] : [] };
    if (sql.includes("SELECT byte_offset,bytes")) return { rows: parts };
    if (sql.includes("INSERT INTO app.synthetic_evidence_chunk")) parts.push({ byte_offset: values[2] as number, bytes: values[3] as Buffer });
    return { rows: [] };
  });
  const pool = { connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { pool, row, parts, query, revoke: () => { allowed=false; }, service: new ResumableEvidenceService(pool, true) };
}
function beginRequest() {
  return { version: input.version, id: input.uploadId, jobId: input.jobId, actorMembershipId: member,
    expectedSha256: "0".repeat(64), contentType: "image/png", maximumBytes: 4, expiresAt: new Date("2099-01-01") };
}
beforeEach(() => { vi.restoreAllMocks(); vi.mocked(refuseLockedNewSource).mockReset(); });
describe("dark resumable transfer orchestration (SQL isolation is tested in CI)", () => {
  it("refuses every default-off entry before touching a pool", async () => {
    const f=fixture(), service=new ResumableEvidenceService(f.pool);
    for (const method of ["begin", "append", "status", "finalize"] as const)
      await expect(service[method](context, {})).rejects.toMatchObject({code:"DISABLED"});
    expect(f.query).not.toHaveBeenCalled();
  });
  it("binds every operation and proof read to the authenticated member, refusing queued contexts", async () => {
    const f = fixture();
    const otherMember = randomUUID();
    for (const method of ["begin", "append", "status", "finalize"] as const) {
      const raw = method === "begin" ? beginRequest() : { ...input,
        ...(method === "append" ? { offset: 0, bytes: new Uint8Array([1]) } :
          method === "finalize" ? { commandId: randomUUID(), evidenceType: "photo" } : {}) };
      await expect(f.service[method](context, { ...raw, actorMembershipId: otherMember })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(f.service[method](verifiedTenantContextForQueuedJob(tenant), raw)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    const storage = f.service.storageForProof(context, { ...input, actorMembershipId: otherMember });
    await expect(storage.readExactVersion("synthetic-original", "synthetic-version")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("FROM app.evidence_upload"))).toBe(false);
    expect(f.parts).toHaveLength(0);
    await expect(f.service.status(context, input)).resolves.toMatchObject({ nextOffset: 0 });
    const wrongUser = verifiedTenantContextFromMembership({ tenantId: tenant, identityUserId: randomUUID(), membershipId: member } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
    await expect(f.service.status(wrongUser, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("reads status without a row lock while append still locks the upload", async () => {
    const f = fixture();
    await f.service.status(context, input);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("FOR UPDATE"))).toBe(false);
    await f.service.append(context, { ...input, offset: 0, bytes: new Uint8Array([1]) });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("FROM app.evidence_upload") && sql.includes("FOR UPDATE"))).toBe(true);
  });
  it("caps client expiry at 24 server hours and keeps the stored expiry on replay", async () => {
    const now = Date.parse("2026-10-29T08:00:00Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const f = fixture(), request = beginRequest();
    const first = await f.service.begin(context, request);
    expect(first.upload.expiresAt).toEqual(new Date(now + 24 * 60 * 60 * 1000));
    clock.mockReturnValue(now + 1000);
    expect((await f.service.begin(context, request)).upload.expiresAt).toEqual(first.upload.expiresAt);
    const shorter = new Date(now + 60_000);
    expect((await fixture().service.begin(context, { ...request, expiresAt: shorter })).upload.expiresAt).toEqual(shorter);
    for (const expiresAt of [new Date(now), new Date(now - 1)]) {
      const expired = fixture();
      await expect(expired.service.begin(context, { ...request, expiresAt })).rejects.toMatchObject({ code: "LIMIT" });
      expect(expired.query).not.toHaveBeenCalled();
    }
  });
  it("resumes from persisted offsets in a fresh service and deduplicates exact retries", async () => {
    const f=fixture();
    const request={...input,offset:0,bytes:new Uint8Array([1,2])};
    expect(await f.service.append(context,request)).toEqual({nextOffset:2});
    expect(await new ResumableEvidenceService(f.pool,true).status(context,input)).toMatchObject({nextOffset:2,state:"pending"});
    expect(await f.service.append(context,request)).toEqual({nextOffset:2});
    expect(await f.service.append(context,{...request,offset:2})).toEqual({nextOffset:4});
    expect(f.parts).toHaveLength(2);
  });
  it("rejects changed retries, overlaps, gaps and size overflow", async () => {
    const f=fixture();
    await f.service.append(context,{...input,offset:0,bytes:new Uint8Array([1,2])});
    for (const [offset,bytes] of [[0,[9]], [1,[3]], [3,[3]], [2,[1,2,3]]] as const)
      await expect(f.service.append(context,{...input,offset,bytes:new Uint8Array(bytes)})).rejects.toMatchObject({code:offset===2?"LIMIT":"CONFLICT"});
    expect(f.parts).toHaveLength(1);
  });
  it("leaves interrupted uploads pending when finalize is attempted early", async () => {
    const f=fixture();
    await f.service.append(context,{...input,offset:0,bytes:new Uint8Array([1])});
    await expect(f.service.finalize(context,{...input,commandId:randomUUID(),evidenceType:"site_photo"})).rejects.toMatchObject({code:"INCOMPLETE"});
    expect(f.row.state).toBe("pending");
    await expect(f.service.append(context,{...input,offset:1,bytes:new Uint8Array([2,3,4])})).resolves.toEqual({nextOffset:4});
  });
  it("refuses other tenants, jobs and revoked access without exposing offsets", async () => {
    const f=fixture();
    await expect(f.service.status(verifiedTenantContextForQueuedJob(randomUUID()),input)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(f.service.status(context,{...input,jobId:randomUUID()})).rejects.toMatchObject({code:"NOT_FOUND"});
    f.revoke();
    for (const method of ["append", "status", "finalize"] as const)
      await expect(f.service[method](context,{...input,...(method==="append"?{offset:0,bytes:new Uint8Array([1])}:method==="finalize"?{commandId:randomUUID(),evidenceType:"photo"}:{})})).rejects.toMatchObject({code:"NOT_FOUND"});
  });
  it.each(["verified","rejected","quarantined","expired","locked"])("refuses appends after %s", async state => {
    const f=fixture();
    if(state==="expired") f.row.expires_at=new Date(0);
    else if(state==="locked") vi.mocked(refuseLockedNewSource).mockRejectedValue(new Error("locked"));
    else f.row.state=state;
    await expect(f.service.append(context,{...input,offset:0,bytes:new Uint8Array([1])})).rejects.toThrow();
    expect(f.parts).toHaveLength(0);
  });
  it("finalizes server-read bytes once and rejects a different type on replay", async () => {
    const f=fixture(), bytes=new Uint8Array([255,216,1,2,255,217]);
    f.row.maximum_bytes=String(bytes.length); f.row.expected_content_type="image/jpeg";
    f.row.expected_sha256=createHash("sha256").update(bytes).digest("hex");
    await f.service.append(context,{...input,offset:0,bytes});
    const command={...input,commandId:randomUUID(),evidenceType:"site_photo"};
    const result=await f.service.finalize(context,command);
    expect(result).toMatchObject({id:input.uploadId,sha256:f.row.expected_sha256,object_version_id:`synthetic-${f.row.expected_sha256}`});
    expect(await f.service.finalize(context,command)).toEqual(result);
    expect(f.query.mock.calls.filter(([sql])=>sql.startsWith("INSERT INTO app.evidence_object"))).toHaveLength(1);
    await expect(f.service.finalize(context,{...command,evidenceType:"other"})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
  });
  it("rejects bytes that disagree with the client hash and cannot resurrect the upload", async () => {
    const f=fixture();
    await f.service.append(context,{...input,offset:0,bytes:new Uint8Array([1,2,3,4])});
    await expect(f.service.finalize(context,{...input,commandId:randomUUID(),evidenceType:"site_photo"})).rejects.toMatchObject({code:"OBJECT_INVALID",message:"wrong_hash"});
    expect(f.row.state).toBe("rejected");
    await expect(f.service.append(context,{...input,offset:0,bytes:new Uint8Array([1])})).rejects.toMatchObject({code:"CONFLICT"});
  });
  it("validates narrow synthetic voice bytes without widening the ordinary upload boundary", () => {
    const bytes=Buffer.alloc(46); bytes.write("RIFF");bytes.writeUInt32LE(38,4);bytes.write("WAVEfmt ",8);
    bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);
    bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write("data",36);bytes.writeUInt32LE(2,40);
    expect(hasCompletePcmWav(bytes)).toBe(true);
    expect(hasCompletePcmWav(bytes.subarray(0,45))).toBe(false);
    const request={jobId:input.jobId,expectedSha256:"0".repeat(64),contentType:"image/png",maximumBytes:100,expiresAt:new Date("2099-01-01")};
    expect(beginEvidenceUploadSchema.safeParse(request).success).toBe(true);
    expect(beginEvidenceUploadSchema.safeParse({...request,contentType:"audio/wav"}).success).toBe(false);
  });
});
