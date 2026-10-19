import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { EvidenceService, ProofApplicationRecords, DEMO_TENANT_ID } from "@jobguard/db";
import { ProofApplication, generatePracticePng } from "./proof.application.js";

// Run the private synthetic storage adapter through the real application's finalize
// path. Only finalization persistence is doubled; PostgreSQL ownership is tested in CI.
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("S14 reads adopted proof originals through inherited ownership, retaining exact-version and stranger refusals", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const job = randomUUID(), upload = randomUUID(), token = randomUUID(), bytes = generatePracticePng();
  let stranger = false;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("authenticate_practice_session")) return { rows: [{ tenant_id: DEMO_TENANT_ID, membership_id: upload, identity_user_id: job }] };
    if (sql.includes("WITH RECURSIVE practice_owned_job") && !sql.includes("synthetic_evidence_original")) return { rows: stranger ? [] : [{ id: job }] };
    if (sql.startsWith("SELECT id FROM app.evidence_upload") || sql.startsWith("SELECT 1 FROM app.evidence_upload")) return { rows: [{}] };
    if (sql.includes("FROM app.synthetic_evidence_original")) {
      expect(values[0]).toBe(DEMO_TENANT_ID);
      expect(values).toContain("synthetic-key");
      expect(values).toContain("v1");
      return { rows: !stranger && sql.includes("WITH RECURSIVE practice_owned_job") ? [{ bytes, content_type: "image/png" }] : [] };
    }
    return { rows: [] };
  });
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  vi.spyOn(ProofApplicationRecords.prototype, "replay").mockResolvedValue(null);
  vi.spyOn(ProofApplicationRecords.prototype, "record").mockImplementation(async (_context, input) => input.response);
  vi.spyOn(EvidenceService.prototype, "finalize").mockImplementation(async function (this: EvidenceService) {
    const storage = (this as unknown as { storage: { readExactVersion(key: string, version: string): Promise<{ bytes: Uint8Array }> } }).storage;
    const original = await storage.readExactVersion("synthetic-key", "v1");
    expect(original.bytes).toEqual(bytes);
    return { id: upload };
  });
  const app = new ProofApplication(pool, token);
  vi.spyOn(app, "get").mockResolvedValue({ jobId: job } as never);
  const command = { version: "practice-proof-command.v1", action: "finalize", commandId: randomUUID(), uploadId: upload, objectVersionId: "v1" };
  await expect(app.command(job, command)).resolves.toMatchObject({ jobId: job });
  stranger = true;
  await expect(app.command(job, { ...command, commandId: randomUUID() })).rejects.toThrow("NOT_FOUND");
});
