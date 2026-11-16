import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { parseObservation } from "@jobguard/core";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { decodePracticePhoto } from "../src/practice-photo-observation.js";
import { createFinalCheckWorker } from "./final-check-worker-factory.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant,
  insertFinalCheckEvidence, FINAL_CHECK_ACTOR, type FinalCheckFixture } from "./final-check-fixture.js";

let f: FinalCheckFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); }, 60_000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

it.each(["included", "unmatched"] as const)("persisted painting classification keeps a genuine extra and %s inclusion has no commercial effects", async answer => {
  const a = await seedFinalCheckJob(f), revisionId = randomUUID(), lineId = randomUUID();
  // Append the fictional decorating account, preserving the fixture's first
  // revision. No edit to a commercial revision, snapshot or immutable lock.
  await finalCheckTenant(f.admin, a.tenantId, async db => {
    await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
      SELECT $1,tenant_id,job_id,final_account_draft_id,2,repeat('b',64),baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings
      FROM app.final_account_revision WHERE tenant_id=$2 AND job_id=$3 AND id=$4`, [revisionId, a.tenantId, a.jobId, a.revisionId]);
    await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
      SELECT $1,tenant_id,job_id,$2,line_kind,source_id,scope_item_id,commercial_revision_id,'Paint the hall, stairs and landing',net_pence,ordinal
      FROM app.final_account_line WHERE tenant_id=$3 AND job_id=$4 AND id=$5`, [lineId, revisionId, a.tenantId, a.jobId, a.lineId]);
    await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND job_id=$3", [revisionId, a.tenantId, a.jobId]);
  });
  const photo = await insertFinalCheckEvidence(f, a), tap = await insertFinalCheckEvidence(f, a);
  const originals = await f.admin.query(`SELECT id,object_version_id,sha256,to_char(server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') received
    FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2 ORDER BY id`, [a.tenantId, a.jobId]);
  const observations = originals.rows.map(row => {
    const text = "Fitted outside tap.";
    const decoded = decodePracticePhoto(row.sha256, "a".repeat(64))!;
    return parseObservation({ version: "observation.v1", tenantId: a.tenantId, jobId: a.jobId, kind: "completion_photo",
      evidence: { id: row.id, objectVersionId: row.object_version_id, sha256: row.sha256, serverReceivedAt: row.received },
      ...(row.id === photo ? decoded : { text, citations: [{ start: 0, end: text.length, quote: text }],
        facts: { ...decoded.facts, workReference: "outside-tap", description: "outside tap" } }),
    });
  });
  expect(observations.find(o => o.evidence.id === tap)!.facts.description).toBe("outside tap");
  const builder = new FinalCheckRepository(f.runtime);
  expect(await builder.read(a.context, a.jobId, a.digest)).toEqual({ state: "unlocked", items: [] });
  await new FinalAccountLockRepository(practiceMaterialPool(f.runtime, a.digest)).lock(a.context, {
    jobId: a.jobId, actorMembershipId: FINAL_CHECK_ACTOR, commandId: randomUUID(), finalAccountRevisionId: revisionId,
    expectedRevision: 2, declarationVersion: "final_account_declaration.v1",
  });
  const repo = new FinalCheckRepository(f.shadow), manifest = await repo.begin(a.workerContext, a.jobId);
  const worker = createFinalCheckWorker(f.shadow, observations, "synthetic_demo");
  const task = { version: "final-check.task.v1" as const, jobId: a.jobId, manifestId: manifest.id };
  await worker.execute(a.workerContext, task);
  const completed = await repo.manifest(a.workerContext, a.jobId, manifest.id);
  expect(completed.sources.every(s => s.status === "detected")).toBe(true);
  expect(completed.result!.classifications).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: "already_in_original_scope" })]));
  const check = await builder.read(a.context, a.jobId, a.digest);
  expect(check.state).toBe("completed"); expect(check.items).toHaveLength(1);
  expect(check.items[0]).toMatchObject({ description: "outside tap" });
  const item = check.items[0]!;
  const body = { version: "final-check.disposition.v1" as const, commandId: randomUUID(), lockId: check.lockId!, runId: check.runId!,
    signalId: String(item.signalId), expectedSignalRevision: Number(item.signalRevision), answer: "already_included" as const, referenceId: lineId };
  await expect(builder.disposition(a.context, a.jobId, a.digest, { ...body, referenceId: randomUUID() })).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
  const before = (await f.admin.query("SELECT row_to_json(l)::text bytes FROM app.final_account_lock l WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows;
  const command = { ...body, referenceId: answer === "included" ? lineId : null };
  const result = await builder.disposition(a.context, a.jobId, a.digest, command);
  expect(result).toMatchObject({ disposition: answer === "included" ? "already_included" : "attribution_disputed" });
  expect(await builder.disposition(a.context, a.jobId, a.digest, command)).toEqual(result);
  const saved = await builder.read(a.context, a.jobId, a.digest);
  await worker.execute(a.workerContext, task);
  expect(await builder.read(a.context, a.jobId, a.digest)).toEqual(saved);
  expect((await repo.manifest(a.workerContext, a.jobId, manifest.id)).result).toEqual(completed.result);
  expect((await f.admin.query("SELECT row_to_json(l)::text bytes FROM app.final_account_lock l WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows).toEqual(before);
  for (const table of ["variation", "recovery_case", "recovery_fee_journal"])
    expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [a.tenantId, a.jobId])).rows[0].n).toBe(0);
});
