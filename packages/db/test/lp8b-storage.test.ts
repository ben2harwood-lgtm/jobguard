import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PrivateVersionedStorage, StoredObject } from "@jobguard/storage";
import { describe, expect, it, vi } from "vitest";
import { EvidenceService } from "../src/evidence.js";
import { appendOutboundAction } from "../src/outbox.js";
import { verifiedTenantContextForQueuedJob, type TenantTransaction } from "../src/tenant-context.js";
import { MemoryStorage, pngBytes } from "./site-extra-evidence-fixtures.js";

vi.mock("../src/watchdog.js", () => ({
  requireLiveJob: vi.fn(), readCommandIdentity: vi.fn(), claimCommandIdentity: vi.fn(),
  findStoredResult: vi.fn(), storeCommandResult: vi.fn(), requestHashFor: vi.fn(), commandIdFor: vi.fn(),
}));

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
describe("LP-8b external original integrity (service orchestration, not SQL isolation)", () => {
  it.each(["key", "version", "bytes", "length", "valid"])("checks the returned %s before database verification", async kind => {
    const tenant = randomUUID(), id = randomUUID(), job = randomUUID(), bytes = pngBytes(8);
    const key = `tenants/${tenant}/uploads/${id}/original`, storage = new MemoryStorage();
    storage.put(key,"v1",bytes);
    const stored = {...await storage.readExactVersion(key,"v1")};
    storage.versions.set(`${key}:v1`,stored);
    if(kind==="key") stored.key=`tenants/${randomUUID()}/uploads/${id}/original`;
    if(kind==="version") stored.versionId="v2";
    if(kind==="bytes") stored.bytes=pngBytes(9);
    if(kind==="length") stored.byteLength++;
    const query=vi.fn(async(sql:string) => {
      if(sql.startsWith("SELECT job_id FROM app.evidence_upload"))return {rows:[{job_id:job}]};
      if(sql.startsWith("SELECT * FROM app.evidence_upload"))return {rows:[{id,job_id:job,object_key:key,object_version_id:"v1",state:"quarantined",expires_at:new Date("2099-01-01"),expected_sha256:hash(bytes),expected_content_type:"image/png",maximum_bytes:"1000"}]};
      if(sql.startsWith("SELECT app.verify_evidence_upload"))return {rows:[{verified:new Date()}]};
      if(sql.startsWith("INSERT INTO app.evidence_object"))return {rows:[{id}]};
      return {rows:[]};
    });
    const pool={connect:async()=>({query,release(){}})} as unknown as Pool;
    const result=new EvidenceService(pool,storage).finalize(verifiedTenantContextForQueuedJob(tenant),{uploadId:id,objectVersionId:"v1",evidenceType:"site_photo"});
    if(kind==="valid") {
      await expect(result).resolves.toMatchObject({id});
      expect(query.mock.calls.some(([sql])=>sql.startsWith("SELECT app.verify_evidence_upload"))).toBe(true);
    } else {
      await expect(result).rejects.toMatchObject({code:"OBJECT_INVALID"});
      expect(query.mock.calls.some(([sql])=>sql.startsWith("SELECT app.verify_evidence_upload"))).toBe(false);
      expect(query.mock.calls.some(([sql])=>sql.startsWith("INSERT INTO app.evidence_object"))).toBe(false);
    }
  });
  it("refuses another tenant's preview key before reading any external bytes", async()=>{
    const storage={readExactVersion:vi.fn<(...args: unknown[])=>Promise<StoredObject>>()} as unknown as PrivateVersionedStorage;
    const service=new EvidenceService({} as Pool,storage);
    await expect(service.registerPreview(verifiedTenantContextForQueuedJob(randomUUID()),{id:randomUUID(),originalEvidenceId:randomUUID(),objectKey:`tenants/${randomUUID()}/uploads/x/preview`,objectVersionId:"v1",contentType:"image/png",maximumBytes:100})).rejects.toMatchObject({code:"EVIDENCE_NOT_AUTHORIZED"});
    expect(storage.readExactVersion).not.toHaveBeenCalled();
  });
});

it("passes the full requested action to the checked SQL boundary",async()=>{
  const query=vi.fn(async()=>({rows:[]})), tenant=randomUUID(), content="Fictional approved quote";
  const action={version:"outbound-action.v1",id:randomUUID(),authorizationId:randomUUID(),adapter:"fake_capture",providerEffectKey:"fictional:1",actionType:"quote.send",recipient:"fictional@example.invalid",contentHash:hash(content),immutableContent:content,aggregateRevision:3,amountPence:100,currency:"GBP",policyVersion:"synthetic.v1",authorizationExpiresAt:new Date("2099-01-01")};
  await appendOutboundAction({$client:{query}} as unknown as TenantTransaction,tenant,action);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("SELECT app.insert_authorized_action(app.current_actor()"),[action.id,tenant,action.authorizationId,action.adapter,action.providerEffectKey,action.actionType,action.recipient,action.contentHash,content,3,100,"GBP","synthetic.v1",action.authorizationExpiresAt]);
  await expect(appendOutboundAction({$client:{query}} as unknown as TenantTransaction,tenant,{...action,immutableContent:"substituted"})).rejects.toThrow("CONTENT_HASH_MISMATCH");
  expect(query).toHaveBeenCalledTimes(1);
});
