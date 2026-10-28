import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { prepareEvidencePackV3Sources } from "../src/evidence-pack-v3-sources.js";
import { asFixtureTenant } from "./recovery-attribution-fixture.js";
import { createEvidencePackV3Fixture, closeEvidencePackV3Fixture, readOrdinary, recordingPool, type V3Fixture } from "./evidence-pack-v3-fixture.js";
let f: V3Fixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createEvidencePackV3Fixture(); }, 90_000);
afterAll(async () => { if (f) await closeEvidencePackV3Fixture(f); vi.unstubAllEnvs(); });
it("ordinary-source bytes and held-request SQL are identical before/after ordinary hidden signals", async () => {
  // This proves this bounded source path only: no v3 artifact, real worker receipt,
  // HTTP timing, server nested-query log or twin-world browser claim is made.
  const requestId = randomUUID(), statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const pool = recordingPool(f.runtime, statements);
  const held = async () => {
    statements.length = 0;
    const result = await prepareEvidencePackV3Sources(pool, f.source.sessionToken, f.caseId, requestId)
      .then(() => { throw new Error("unexpected success"); }, error => ({ code: error.code, message: error.message }));
    expect(result).toEqual({ code: "EVIDENCE_PACK_V3_DEPENDENCY_HELD", message: "EVIDENCE_PACK_V3_DEPENDENCY_HELD" });
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.map(s => s.sql).join("\n")).not.toMatch(/app\.(?:shadow|recovery_attribution)|reveal_shadow|break_glass/u);
    return { bytes: JSON.stringify(result), statements: structuredClone(statements) };
  };
  const zeroSources = JSON.stringify(await readOrdinary(f)), zero = await held();
  await asFixtureTenant(f.shadow, f.source.tenantId, async db => {
    for (let n = 0; n < 25; n++) await db.query(`INSERT INTO app.shadow_commercial_signal
      (tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
      VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:CH8-V',clock_timestamp(),'Fictional held extra','low','held_for_final_check')`,
    [f.source.tenantId, f.source.jobId, randomUUID()]);
  });
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_commercial_signal WHERE job_id=$1", [f.source.jobId])).rows[0].n).toBe(25);
  expect(JSON.stringify(await readOrdinary(f))).toBe(zeroSources);
  expect(await held()).toEqual(zero);
});
it("no worker or builder path can use the source preparation to write an artifact", async () => {
  await expect(prepareEvidencePackV3Sources(f.runtime, f.source.sessionToken, f.caseId, randomUUID())).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  const rows = await f.admin.query("SELECT count(*)::int n FROM app.evidence_pack_revision WHERE case_id=$1", [f.caseId]);
  expect(rows.rows[0].n).toBe(0);
});
