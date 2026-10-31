import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { expect, it, vi } from "vitest";
import { appendAuditBatch } from "./audit.js";
import { ProofCommandService } from "./proof-repository.js";
import { verifiedTenantContextForQueuedJob as testTenantContext } from "./tenant-context.js";
vi.mock("./watchdog.js", () => ({ requireLiveJob: vi.fn(), readCommandIdentity: vi.fn(), claimCommandIdentity: vi.fn(), requestHashFor: () => "a".repeat(64) }));
vi.mock("./audit.js", () => ({ appendAuditBatch: vi.fn() }));

it("S13 replacement proof completes the same stage after invalidation instead of colliding with the original receipt", async () => {
  vi.mocked(appendAuditBatch).mockClear();
  const tenant = randomUUID(), job = randomUUID(), scope = randomUUID(), actor = randomUUID(), oldId = randomUUID(), evidence = randomUUID();
  const bytes = Buffer.from("fictional proof"), hash = createHash("sha256").update(bytes).digest("hex");
  const stageKey = `${job}:${scope}:electrical-stage`, completionId=randomUUID();
  const storedResult={completionId,evidenceId:evidence,state:"complete",decisionId:null};
  let claimedSemantic:string|undefined;
  const query = async (sql: string, values: unknown[] = []) => {
    const result = (rows: unknown[] = []) => ({ rows, rowCount: rows.length });
    if (sql.startsWith("SELECT 1 FROM app.membership")) return result([{}]);
    if (sql.includes("FROM app.command_receipt")) return result();
    if (sql.includes("app.begin_command(")) {
      claimedSemantic=values[3] as string;
      if(claimedSemantic===stageKey)throw new Error("COMMAND_CONFLICT");
      return result([{result:{kind:"claim"}}]);
    }
    if (sql.includes("app.complete_command(")) {
      expect(appendAuditBatch).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({eventType:"proof.completed"})]);
      expect(JSON.parse(values[1] as string)).toEqual({});
      return result([{result:storedResult}]);
    }
    if (sql.includes("FROM app.stage_completion")) return result([{ id: oldId, invalidated: true }]);
    if (sql.includes("FROM app.evidence_object") && sql.includes("e.kind='original'")) return result([{ id: evidence, sha256: hash, object_key: "proof", object_version_id: "v1" }]);
    if (sql.includes("FROM app.evidence_link")) return result([{ id: randomUUID() }]);
    if (sql.includes("FROM app.scope_progress")) return result([{ stage: "complete", revision: 2 }]);
    return result();
  };
  const pool = { connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const storage = { readExactVersion: async () => ({ key: "proof", versionId: "v1", bytes }) } as unknown as PrivateVersionedStorage;
  await expect(new ProofCommandService(pool, storage).complete(testTenantContext(tenant), {
    version: "proof.complete.v1", commandId: randomUUID(), actorMembershipId: actor, jobId: job, scopeItemId: scope,
    stage: "electrical-stage", evidenceId: evidence, requiredEvidenceType: "electrical_certificate", decisionId: null,
  })).resolves.toEqual(storedResult);
  expect(claimedSemantic).toBe(`${stageKey}:${oldId}`);
});
