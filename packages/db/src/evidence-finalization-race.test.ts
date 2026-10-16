import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { describe, expect, it, vi } from "vitest";
import { EvidenceService } from "./evidence.js";
import { verifiedTenantContextForQueuedJob as testTenantContext } from "./tenant-context.js";

vi.mock("./watchdog.js", () => ({
  requireLiveJob: vi.fn(), readCommandIdentity: vi.fn(), claimCommandIdentity: vi.fn(),
  findStoredResult: vi.fn(), storeCommandResult: vi.fn(), requestHashFor: vi.fn(), commandIdFor: vi.fn(),
}));

// Service orchestration double only. The matching real-role race is in
// serious-b4-evidence-proof.integration.test.ts; SQL isolation is a CI assertion.
describe("S12 finalization rejection belongs to the pending version", () => {
  it.each(["verified", "newer version", "same pending version"])("preserves %s after a delayed storage failure", async scenario => {
    const tenant = randomUUID(), upload = randomUUID(), job = randomUUID();
    const row = { id: upload, job_id: job, state: "pending", object_version_id: null as string | null,
      object_key: "synthetic-original", expires_at: new Date("2099-01-01") };
    let readStarted!: () => void, failRead!: (error: Error) => void;
    const started = new Promise<void>(resolve => { readStarted = resolve; });
    const reading = new Promise<never>((_resolve, reject) => { failRead = reject; });
    const query = async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith("SELECT job_id FROM app.evidence_upload")) return { rows: [{ job_id: job }] };
      if (sql.startsWith("SELECT * FROM app.evidence_upload")) return { rows: [{ ...row }] };
      if (sql.includes("SET state='quarantined'")) { row.state = "quarantined"; row.object_version_id = values[2] as string; }
      if (sql.includes("SET state='rejected'")) {
        // Model PostgreSQL's guarded UPDATE, including the old unconditional path.
        const guarded = sql.includes("state IN ('pending','quarantined')") && sql.includes("object_version_id IS NOT DISTINCT FROM $4");
        if (!guarded || (["pending", "quarantined"].includes(row.state) && row.object_version_id === values[3])) row.state = "rejected";
      }
      return { rows: [], rowCount: 0 };
    };
    const pool = { connect: async () => ({ query, release() {} }) } as unknown as Pool;
    const storage = { readExactVersion: async () => { readStarted(); return reading; } } as unknown as PrivateVersionedStorage;
    const service = new EvidenceService(pool, storage);
    const failed = service.finalize(testTenantContext(tenant), { uploadId: upload, objectVersionId: "v1", evidenceType: "site_photo" }).catch(error => error);
    await started;
    if (scenario === "verified") row.state = "verified";
    if (scenario === "newer version") row.object_version_id = "v2";
    failRead(new Error("delayed storage failure"));
    expect(await failed).toMatchObject({ code: "OBJECT_INVALID", message: "missing_version" });
    expect(row.state).toBe(scenario === "verified" ? "verified" : scenario === "newer version" ? "quarantined" : "rejected");
    expect(row.object_version_id).toBe(scenario === "newer version" ? "v2" : "v1");
  });
});
