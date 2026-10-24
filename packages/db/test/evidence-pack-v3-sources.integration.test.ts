import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { withTenant } from "../src/tenant-context.js";
import { RecoveryCaseRepository } from "../src/recovery-case-repository.js";
import { issuePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { prepareEvidencePackV3Sources, verifyEvidencePackV3Case, loadEvidencePackV3Sources } from "../src/evidence-pack-v3-sources.js";
import { heldEvidencePackV3Ports } from "../src/evidence-pack-v3-ports.js";
import { createEvidencePackV3Fixture, closeEvidencePackV3Fixture, readOrdinary, type V3Fixture } from "./evidence-pack-v3-fixture.js";
let f: V3Fixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createEvidencePackV3Fixture(); }, 90_000);
afterAll(async () => { if (f) await closeEvidencePackV3Fixture(f); vi.unstubAllEnvs(); });
it("reads the actually commanded owned case and exact ordinary versions without certifying v3", async () => {
  const result = await readOrdinary(f);
  expect(result.scope).toMatchObject({ tenantId: f.source.tenantId, jobId: f.source.jobId, caseId: f.caseId });
  expect(result.scope.visibleSourceRevision).toMatch(/^[a-f0-9]{64}$/u);
  expect(result.sources.map(s => s.sourceId)).toContain(`customer_invoice:${f.source.invoiceId}`);
  expect(result.sources.map(s => s.sourceId)).toContain(`evidence_object:${f.source.proofId}`);
  expect(result).toMatchObject({ lifecycle: "pre_lock", producerBindings: "held", complete: false });
  expect(await readOrdinary(f, f.caseId.toUpperCase())).toEqual(result);
});
it("no accepted must-surface producer means a hold, never a successful pack", async () => {
  await expect(prepareEvidencePackV3Sources(f.runtime, f.source.sessionToken, f.caseId, randomUUID()))
    .rejects.toMatchObject({ code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD", hold: "HOLD-EP-MUST-SURFACE" });
  expect((await f.admin.query("SELECT count(*)::int n FROM app.evidence_pack_revision WHERE case_id=$1", [f.caseId])).rows[0].n).toBe(0);
});
it("forged/copied binding and binding from another transaction cannot read sources", async () => {
  let genuine: Awaited<ReturnType<typeof verifyEvidencePackV3Case>>;
  await withTenant(f.runtime, f.auth.context, async tx => {
    genuine = await verifyEvidencePackV3Case(tx, f.source.tenantId, f.caseId, f.auth.digest);
    await expect(loadEvidencePackV3Sources(tx, { ...genuine })).rejects.toThrow("NOT_FOUND");
  });
  await withTenant(f.runtime, f.auth.context, async tx => {
    await expect(loadEvidencePackV3Sources(tx, genuine!)).rejects.toThrow("NOT_FOUND");
  });
});
it("wrong case, unowned same-tenant job and another session fail before the handoff", async () => {
  const requestCheck = vi.fn(), ports = { ...heldEvidencePackV3Ports, mustSurface: { requestCheck, readCompletion: vi.fn() } };
  for (const caseId of [randomUUID(), f.source.emptyCaseId]) await expect(prepareEvidencePackV3Sources(f.runtime, f.source.sessionToken, caseId, randomUUID(), ports)).rejects.toThrow("NOT_FOUND");
  const stranger = await issuePracticeSession(f.runtime);
  await expect(prepareEvidencePackV3Sources(f.runtime, stranger, f.caseId, randomUUID(), ports)).rejects.toThrow("NOT_FOUND");
  expect(requestCheck).not.toHaveBeenCalled();
});
it("worker-contract rejection propagates pending/failed/stale; no all-clear is invented", async () => {
  for (const state of ["pending", "failed", "stale", "revoked", "wrong-job"]) {
    const completion = vi.fn(async () => { throw new Error(`TEST-WORKER-${state}`); });
    await expect(prepareEvidencePackV3Sources(f.runtime, f.source.sessionToken, f.caseId, randomUUID(), {
      ...heldEvidencePackV3Ports, mustSurface: { requestCheck: async () => "opaque-test-only", readCompletion: completion },
    })).rejects.toThrow(`TEST-WORKER-${state}`);
    expect(completion).toHaveBeenCalledTimes(1);
  }
});
it("authority is rechecked after a test-only handoff wait", async () => {
  try {
    await expect(prepareEvidencePackV3Sources(f.runtime, f.source.sessionToken, f.caseId, randomUUID(), {
      ...heldEvidencePackV3Ports, mustSurface: {
        requestCheck: async () => "opaque-test-only",
        readCompletion: async () => { await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [f.auth.digest]); },
      },
    })).rejects.toThrow("UNAUTHENTICATED");
  } finally { await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=NULL WHERE token_digest=$1", [f.auth.digest]); }
});
it("source change across a test-only handoff is a conflict, not a mixed snapshot", async () => {
  await expect(prepareEvidencePackV3Sources(f.runtime, f.source.sessionToken, f.caseId, randomUUID(), {
    ...heldEvidencePackV3Ports, mustSurface: {
      requestCheck: async () => "opaque-test-only",
      readCompletion: async () => {
        const scoped = practiceMaterialPool(f.runtime, f.auth.digest);
        await withTenant(scoped, f.auth.context, async tx => {
          const current = (await tx.$client.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2", [f.source.tenantId, f.caseId])).rows[0];
          await new RecoveryCaseRepository(scoped).commandInTransaction(tx, f.auth.context, f.source.jobId, {
            version: "recovery-case-command.v1", action: "amend_claim", commandId: randomUUID(),
            caseId: f.caseId, claimedNetPence: 33000, expectedRevision: Number(current.revision),
          }, { membershipId: f.auth.membershipId, identityUserId: f.auth.identityUserId });
        });
      },
    },
  })).rejects.toThrow("EVIDENCE_PACK_V3_SOURCE_CONFLICT");
});
it("foreign tenant is refused before ordinary sources even for a genuine transaction object", async () => {
  await withTenant(f.runtime, f.auth.context, async tx => {
    await expect(verifyEvidencePackV3Case(tx, f.source.otherTenantId, f.caseId, f.auth.digest)).rejects.toThrow("UNAUTHENTICATED");
  });
});
it("expired session is refused rather than using earlier verified authority", async () => {
  const expires = (await f.admin.query("SELECT expires_at::text value FROM control_plane.practice_session WHERE token_digest=$1", [f.auth.digest])).rows[0].value;
  try {
    await f.admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [f.auth.digest]);
    await expect(prepareEvidencePackV3Sources(f.runtime, f.source.sessionToken, f.caseId, randomUUID())).rejects.toThrow("UNAUTHENTICATED");
  } finally { await f.admin.query("UPDATE control_plane.practice_session SET expires_at=$2::timestamptz WHERE token_digest=$1", [f.auth.digest, expires]); }
});
it("the original-byte integrity gate refuses a changed stored original", async () => {
  const original = (await f.admin.query("SELECT bytes FROM app.synthetic_evidence_original WHERE upload_id=(SELECT upload_id FROM app.evidence_object WHERE id=$1)", [f.source.proofId])).rows[0].bytes;
  try {
    // Privileged corruption control, never a positive journey or runtime write.
    await f.admin.query("UPDATE app.synthetic_evidence_original SET bytes=$2 WHERE upload_id=(SELECT upload_id FROM app.evidence_object WHERE id=$1)", [f.source.proofId, Buffer.from("corrupt")]);
    await expect(readOrdinary(f)).rejects.toMatchObject({ code: "EVIDENCE_PACK_SOURCE_CONTENT_MISMATCH" });
  } finally { await f.admin.query("UPDATE app.synthetic_evidence_original SET bytes=$2 WHERE upload_id=(SELECT upload_id FROM app.evidence_object WHERE id=$1)", [f.source.proofId, original]); }
});
it("ordinary runtime cannot mutate an original server receive time", async () => {
  await expect(f.runtime.query("UPDATE app.evidence_object SET server_received_at=server_received_at+interval '1 microsecond' WHERE id=$1", [f.source.proofId])).rejects.toThrow(/permission denied/u);
});
it("the immutable evidence trigger independently refuses a privileged receive-time mutation", async () => {
  await expect(f.admin.query("UPDATE app.evidence_object SET server_received_at=server_received_at+interval '1 microsecond' WHERE id=$1", [f.source.proofId])).rejects.toThrow("registered evidence is immutable");
});
it("empty or oversized opaque handoff references cannot be interpreted as completed", async () => {
  for (const reference of ["", "x".repeat(4097)]) {
    const readCompletion = vi.fn();
    await expect(prepareEvidencePackV3Sources(f.runtime, f.source.sessionToken, f.caseId, randomUUID(), {
      ...heldEvidencePackV3Ports, mustSurface: { requestCheck: async () => reference, readCompletion },
    })).rejects.toThrow("EVIDENCE_PACK_V3_SOURCE_CONFLICT");
    expect(readCompletion).not.toHaveBeenCalled();
  }
});
