import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startBeforeMigration, applyMigration } from "./contractor-practice-session-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
import { DunningRepository } from "../src/dunning-repository.js";
const migration = "0564_dunning_workbench_preview.sql";
let c: Cluster;
beforeAll(async () => { c = await startBeforeMigration(migration); }, 240000);
afterAll(async () => { await c?.close(); });
it("0564_dunning_workbench_preview preserves populated history, redrafts expired previews once and reports the current Decision", async () => {
  const a = await meterCompany(c as unknown as WorkFixture), iid = randomUUID(), did = randomUUID();
  const p = { version: "dunning-invoice.v1", environment: "synthetic_demo", tenantId: a.tenantId, jobId: a.jobId, invoiceId: iid,
    revision: 1, sourceRevision: 1, sourceHash: "a".repeat(64), sourceState: "issued_invoice", finalAccountLockId: null,
    currency: "GBP", originalPence: 10000, outstandingPence: 10000, dueTick: 1, category: "customer", recipient: "fictional@example.invalid",
    pilotNoCharge: false, disputed: false, refundPending: false, reversed: false, cancelled: false, attemptState: "none" };
  await c.admin.query("INSERT INTO app.dunning_invoice(tenant_id,job_id,invoice_id,projection) VALUES($1,$2,$3,$4::jsonb)", [a.tenantId,a.jobId,iid,JSON.stringify(p)]);
  await c.admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'dunning_invoice',$3,'dunning.reminder.preview')", [did,a.tenantId,iid]);
  await c.admin.query(`INSERT INTO app.dunning_reminder(tenant_id,job_id,invoice_id,decision_id,snapshot_hash,snapshot,expires_at)
    SELECT tenant_id,job_id,invoice_id,$3,app.final_lock_hash(projection),projection,clock_timestamp()-interval '1 hour'
    FROM app.dunning_invoice WHERE tenant_id=$1 AND invoice_id=$2`, [a.tenantId,iid,did]);
  const before = await proofBefore(c.admin, ["app.dunning_invoice","app.dunning_reminder","app.decision","app.decision_resolution","app.journal","app.journal_line","app.evidence_object","app.audit_event","app.command_receipt"]);
  await applyMigration(c,migration);
  expect(await proofDifferences(c.admin,before)).toEqual({ rows: [], types: [] });
  const repo = new DunningRepository(c.runtime), read = () => repo.read(a.context,a.digest,{ jobId: a.jobId,nowTick:0 });
  const row = (await read()).invoices[0]!;
  expect(row.decision).toBeNull();
  const input = { version: "dunning-persist-command.v1", commandId: randomUUID(), invoiceId: iid, snapshotHash: row.snapshotHash, nowTick: 0 };
  const fresh = await repo.command(a.context,a.digest,a.jobId,"request",input);
  expect(fresh.decisionId).not.toBe(did);
  expect(await repo.command(a.context,a.digest,a.jobId,"request",input)).toEqual(fresh);
  expect((await read()).invoices[0]?.decision).toEqual(fresh);
  expect((await repo.command(a.context,a.digest,a.jobId,"request",{ ...input,commandId:randomUUID() })).decisionId).toBe(fresh.decisionId);
  const approved = await repo.command(a.context,a.digest,a.jobId,"approve",{ ...input,commandId:randomUUID(),decisionId:fresh.decisionId });
  expect((await read()).invoices[0]?.decision).toEqual(approved);
  expect((await c.admin.query("SELECT status FROM app.dunning_reminder WHERE tenant_id=$1 AND decision_id=$2",[a.tenantId,did])).rows).toEqual([{status:"expired"}]);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.dunning_reminder WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(2);
}, 240000);
