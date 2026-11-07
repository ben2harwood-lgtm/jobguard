import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { InterimDraftRepository } from "../src/interim-draft-repository.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import type { WorkFixture } from "./job-work-state-fixtures.js";
let c: Cluster;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });
it("screen commands persist only draft records and refuse forged authority, replays and double billing", async () => {
  const a = await meterCompany(c as unknown as WorkFixture), b = await meterCompany(c as unknown as WorkFixture);
  const repo = new InterimDraftRepository(c.runtime), baseline = randomUUID(), revision = randomUUID();
  await c.admin.query("INSERT INTO app.quote_version(tenant_id,job_id,id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')", [a.tenantId,a.jobId,baseline,"a".repeat(64)]);
  await c.admin.query("INSERT INTO app.scope_revision(tenant_id,job_id,id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional work','1','item',10000,10000)", [a.tenantId,a.jobId,revision,a.scopeId]);
  // Snapshot every existing financial table, not just a hand-picked posting counter.
  const tables = (await c.admin.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='app' AND table_type='BASE TABLE' AND table_name ~ '(invoice|ledger|journal|receipt|fee|collection)'
    AND table_name <> 'interim_draft_record' ORDER BY table_name`)).rows;
  async function financialSnapshot() {
    return Promise.all(tables.map(async ({ table_name }) => {
      if (!/^[a-z_0-9]+$/u.test(table_name)) throw new Error("Unexpected catalogue identifier");
      return [table_name, (await c.admin.query(`SELECT coalesce(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) rows FROM (SELECT to_jsonb(t) v FROM app."${table_name}" t) s`)).rows[0].rows];
    }));
  }
  const before = await financialSnapshot();
  const command = (record: unknown) => ({ version: "interim.persist-command.v1", commandId: randomUUID(), jobId: a.jobId, record });
  const schedule = { id: randomUUID(), version: "interim.schedule.v1", revision: 1, previousScheduleId: null,
    baselineSnapshotId: baseline, approvalDecisionId: randomUUID(), valuationDates: ["2026-11-01"],
    jurisdiction: "unsupported", arrangement: "unsupported", d06TemplateVersion: null, d02TaxPolicyVersion: null,
    lines: [{ id: randomUUID(), scopeItemId: a.scopeId, commercialRevisionId: revision, sourceDocumentId: baseline,
      kind: "baseline", approvalDecisionId: null, netPence: 10000 }] };
  const values = [{ scopeItemId: a.scopeId, netPence: 6000 }];
  const application = { id: randomUUID(), version: "interim.application.v1", applicationId: randomUUID(), revision: 1,
    previousRevisionId: null, scheduleId: schedule.id, valuationDate: "2026-11-01", kind: "interim", cumulativeValues: values };
  const certification = { id: randomUUID(), version: "interim.certification.v1", applicationRevisionId: application.id,
    certificateReference: randomUUID(), cumulativeValues: values };
  const invoice = { id: randomUUID(), version: "interim.invoice-draft.v1", certificationId: certification.id, lines: values, taxPence: 0 };
  const receipt = { id: randomUUID(), version: "interim.synthetic-receipt.v1", invoiceId: invoice.id, amountPence: 2000 };
  const first = command(schedule);
  await repo.command(a.context,a.digest,first); await repo.command(a.context,a.digest,first);
  await expect(repo.command(a.context,a.digest,{...first,record:{...schedule,arrangement:"changed"}})).rejects.toMatchObject({code:"CONFLICT"});
  for (const record of [application, certification, invoice, receipt]) await repo.command(a.context,a.digest,command(record));
  const stored = await repo.read(a.context,a.jobId,a.digest);
  expect(stored.book.records).toHaveLength(5);
  expect(stored.reconciliation).toMatchObject({netInvoiced:{pence:6000},grossReceived:{pence:2000}});
  expect(stored.reconciliation.issueBlockers).toContain("UNSUPPORTED_ARRANGEMENT");
  await expect(repo.command(a.context,a.digest,command({...invoice,id:randomUUID()}))).rejects.toMatchObject({code:"VALUE_LIMIT"});
  await expect(repo.command(a.context,a.digest,command({...invoice,taxPence:1}))).rejects.toMatchObject({code:"REPLAY_CONFLICT"});
  for (const fields of [{tenantId:b.tenantId},{actor:a.digest},{enabled:true}]) {
    await expect(repo.command(a.context,a.digest,{...command(receipt),...fields})).rejects.toMatchObject({code:"INVALID_INPUT"});
    await expect(repo.command(a.context,a.digest,command({...receipt,...fields}))).rejects.toMatchObject({code:"INVALID_INPUT"});
  }
  for (const jobId of [b.jobId,randomUUID()]) {
    await expect(repo.read(a.context,jobId,a.digest)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(repo.command(a.context,a.digest,{...command(schedule),jobId})).rejects.toMatchObject({code:"NOT_FOUND"});
  }
  // Operative membership requires a contractor agreement, outside this fixture.
  for (const role of ["admin","estimator","foreman","finance","read_only"]) {
    await c.admin.query("UPDATE app.membership SET role=$2 WHERE id=$1",[a.actorId,role]);
    // Keep precisely the repository's refusal for roles that its owner boundary rejects.
    const result = await repo.command(a.context,a.digest,first).catch(error => error);
    if (role === "admin") {
      expect(result.book.records).toHaveLength(5);
      expect(await repo.read(a.context,a.jobId,a.digest)).toEqual(stored);
    } else {
      expect(result).toMatchObject({code:"FORBIDDEN"});
      await expect(repo.read(a.context,a.jobId,a.digest)).rejects.toMatchObject({code:"FORBIDDEN"});
    }
  }
  await c.admin.query("UPDATE app.membership SET role='owner' WHERE id=$1",[a.actorId]);
  await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[a.sessionId]);
  await expect(repo.command(a.context,a.digest,first)).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(repo.read(a.context,a.jobId,a.digest)).rejects.toMatchObject({code:"FORBIDDEN"});
  await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()+interval '1 hour', revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
  await expect(repo.command(a.context,a.digest,first)).rejects.toMatchObject({code:"FORBIDDEN"});
  await expect(repo.read(a.context,a.jobId,a.digest)).rejects.toMatchObject({code:"FORBIDDEN"});
  await c.admin.query("UPDATE identity.session SET revoked_at=NULL WHERE id=$1",[a.sessionId]);
  expect(await repo.read(a.context,a.jobId,a.digest)).toEqual(stored);
  // A verified tenant alone is no longer enough, even for direct SQL callers.
  const client = await c.runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
    await expect(client.query("SELECT app.interim_draft_records($1,NULL,$2,'read','{}'::jsonb)",[a.tenantId,a.jobId])).rejects.toThrow("METER_FORBIDDEN");
  } finally { await client.query("ROLLBACK"); client.release(); }
  expect(await financialSnapshot()).toEqual(before);
});
