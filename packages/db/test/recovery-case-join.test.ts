import { fakeAuditAppend } from "./audit-protocol-fixture.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { recoveryCaseCommandV1, recoveryEventTypeV1 } from "@jobguard/core";
import { RecoveryCaseRepository, type RecoveryCaseView } from "../src/recovery-case-repository.js";
import type { TenantTransaction } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tenantId = randomUUID(), jobId = randomUUID(), caseId = randomUUID();
const context = testTenantContext(tenantId);
const reviewer = { membershipId: randomUUID(), identityUserId: randomUUID() };
const landing = () => ({ version: "recovery-case-command.v1", action: "transition", commandId: randomUUID().toUpperCase(),
  caseId: caseId.toUpperCase(), expectedRevision: 3, eventType: "record_landing", amountPence: 100 });
type Statement = { sql: string; values: unknown[] };
type Script = { secondX?: string | null; same?: boolean | null; fail?: string; error?: Error;
  replay?: { case_id: string; payload_hash: string; job_id: string; reviewer_ref: string } };
function recording(script: Script = {}) {
  const statements: Statement[] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    statements.push({ sql, values });
    if (script.fail && sql.includes(script.fail)) throw script.error;
    const rows = sql.includes("FROM app.append_audit(") ? fakeAuditAppend(values[0] as string, tenantId)
      : sql === "SELECT pg_current_xact_id()::text AS x" ? [{ x: "123" }]
      : sql === "SELECT pg_current_xact_id_if_assigned()::text AS x" ? [{ x: script.secondX === undefined ? "123" : script.secondX }]
      : sql.includes(" AS same") ? [{ same: script.same === undefined ? true : script.same }]
      : sql.includes("SELECT id FROM app.membership") ? [{ id: reviewer.membershipId }]
      : sql.includes("SELECT case_id,payload_hash") ? script.replay ? [script.replay] : []
      : sql.includes("SELECT 1 FROM app.job") ? [{ exists: 1 }]
      : sql.includes("SELECT * FROM app.recovery_case_current") ? [{ state: "evidence_assembled", revision: 3,
        claim_pence: "1000", landed: "0", manual_landed: "0", approved_landed: "0", written_off: "0",
        event_count: 2, claim_revision: 1, previous_hash: "a".repeat(64) }]
      : sql.includes(" AS tenant_id") ? [{ tenant_id: tenantId }]
      : sql.includes("app.lock_audit_head()") ? [{ sequence: "0", event_hash: null }]
      : sql.includes("clock_timestamp() AS occurred_at") ? [{ occurred_at: new Date("2026-10-12T12:00:00Z") }] : [];
    return { rows, rowCount: rows.length };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { statements, query, release, connect, pool: { connect } as unknown as Pool,
    db: { $client: { query, release } } as unknown as TenantTransaction };
}
const unusedPool = () => new Proxy({} as Pool, { get: () => { throw new Error("Joined entry touched its pool"); } });
function unjoined(script: Script = {}) {
  const client = recording(script), repo = new RecoveryCaseRepository(client.pool);
  vi.spyOn(repo, "listForMember").mockResolvedValue([{ id: caseId } as RecoveryCaseView]);
  return { ...client, repo };
}
function assertCallerOwned(client: ReturnType<typeof recording>) {
  for (const { sql } of client.statements) {
    expect(sql.trim().toUpperCase()).not.toMatch(/^(BEGIN|START|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|SET|RESET|DISCARD)\b/u);
    expect(sql.toLowerCase()).not.toContain("set_config(");
  }
  expect(client.release).not.toHaveBeenCalled();
  expect(client.connect).not.toHaveBeenCalled();
}
afterEach(() => vi.restoreAllMocks());

it("[U1] unjoined landing owns one write transaction and releases once", async () => {
  const client = unjoined();
  await client.repo.command(context, jobId, landing(), reviewer);
  const sql = client.statements.map(s => s.sql);
  expect(sql[0]).toBe("BEGIN");
  expect(sql[1]).toBe("SELECT set_config('app.tenant_id', $1, true)");
  expect(sql[2]).toContain("SELECT id FROM app.membership");
  expect(sql.at(-2)).toContain("FROM app.append_audit(");
  expect(sql.at(-1)).toBe("COMMIT");
  expect(sql.filter(s => s === "BEGIN")).toHaveLength(1);
  expect(client.connect).toHaveBeenCalledOnce();
  expect(client.release).toHaveBeenCalledOnce();
  expect(client.repo.listForMember).toHaveBeenCalledOnce();
});
it("[U2] unjoined body failure rolls back and preserves the error object", async () => {
  const error = new Error("event rejected"), client = unjoined({ fail: "INSERT INTO app.recovery_case_event", error });
  await expect(client.repo.command(context, jobId, landing(), reviewer)).rejects.toBe(error);
  expect(client.statements.at(-1)?.sql).toBe("ROLLBACK");
  expect(client.statements.some(s => s.sql === "COMMIT")).toBe(false);
  expect(client.release).toHaveBeenCalledOnce();
  expect(client.repo.listForMember).not.toHaveBeenCalled();
});
it("[P1] both modes execute identical body SQL and store the same canonical hash", async () => {
  const input = landing(), own = unjoined(), joined = recording();
  await own.repo.command(context, jobId, input, reviewer);
  await new RecoveryCaseRepository(unusedPool()).commandInTransaction(joined.db, context, jobId, input, reviewer);
  const body = own.statements.slice(2, -1), joinedBody = joined.statements.slice(3);
  expect(joinedBody.map(s => s.sql)).toEqual(body.map(s => s.sql));
  const event = (statements: Statement[]) => statements.find(s => s.sql.startsWith("INSERT INTO app.recovery_case_event"))!.values;
  expect(event(joinedBody).slice(1)).toEqual(event(body).slice(1));
  expect(event(joinedBody)[11]).toBe(event(body)[11]);
  expect(event(joinedBody)[3]).toBe(caseId);
  expect(event(joinedBody)[10]).toBe(input.commandId.toLowerCase());
});
it("[J-N1] joined success returns only a receipt and never controls caller resources", async () => {
  const client = recording(), repo = new RecoveryCaseRepository(unusedPool());
  vi.spyOn(repo, "listForMember").mockRejectedValue(new Error("Joined entry read a view"));
  await expect(repo.commandInTransaction(client.db, context, jobId, landing(), reviewer)).resolves.toEqual({ caseId, replayed: false });
  assertCallerOwned(client);
  expect(repo.listForMember).not.toHaveBeenCalled();
});
it.each(["pg_advisory_xact_lock", "INSERT INTO app.recovery_case_event", "FROM app.append_audit("])(
  "[J-N2] joined failure at %s is unchanged and stops immediately", async fail => {
    const error = new Error(fail), client = recording({ fail, error });
    await expect(new RecoveryCaseRepository(unusedPool()).commandInTransaction(client.db, context, jobId, landing(), reviewer)).rejects.toBe(error);
    expect(client.statements.at(-1)?.sql).toContain(fail);
    expect(client.statements.filter(s => s.sql.includes(fail))).toHaveLength(1);
    assertCallerOwned(client);
  });
it("[J-A1] only the two landing events pass the action boundary, before SQL", async () => {
  const forbidden = [
    { version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), expectedRevision: 0,
      caseType: "withheld_customer_payment", claimedNetPence: 1000, counterparty: "Fictional customer",
      book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"] },
    { version: "recovery-case-command.v1", action: "amend_claim", commandId: randomUUID(), caseId, expectedRevision: 3, claimedNetPence: 2000 },
    ...recoveryEventTypeV1.options.filter(e => e !== "record_landing" && e !== "reverse_landing").map(eventType => ({ ...landing(), eventType })),
  ];
  for (const input of forbidden) {
    const client = recording();
    await expect(new RecoveryCaseRepository(unusedPool()).commandInTransaction(client.db, context, jobId, input, reviewer))
      .rejects.toMatchObject({ code: "RECOVERY_JOIN_ACTION_FORBIDDEN" });
    expect(client.statements).toEqual([]);
  }
  for (const actor of [{ ...reviewer, membershipId: "" }, { ...reviewer, identityUserId: "" }]) {
    const client = recording();
    await expect(new RecoveryCaseRepository(unusedPool()).commandInTransaction(client.db, context, jobId, landing(), actor))
      .rejects.toMatchObject({ code: "RECOVERY_REVIEWER_FORBIDDEN" });
    expect(client.statements).toEqual([]);
  }
  const client = recording(), parsed = recoveryCaseCommandV1.safeParse({});
  if (parsed.success) throw new Error("Invalid fixture parsed");
  await expect(new RecoveryCaseRepository(unusedPool()).commandInTransaction(client.db, context, jobId, {}, reviewer))
    .rejects.toMatchObject({ name: parsed.error.name, issues: parsed.error.issues });
  expect(client.statements).toEqual([]);
});
it.each([null, "124"])("[J-T1] transaction proof refuses second xid %s before tenant or body SQL", async secondX => {
  const client = recording({ secondX });
  await expect(new RecoveryCaseRepository(unusedPool()).commandInTransaction(client.db, context, jobId, landing(), reviewer))
    .rejects.toMatchObject({ code: "RECOVERY_JOIN_TRANSACTION_REQUIRED" });
  expect(client.statements.map(s => s.sql)).toEqual(["SELECT pg_current_xact_id()::text AS x", "SELECT pg_current_xact_id_if_assigned()::text AS x"]);
  assertCallerOwned(client);
});
it.each([false, null])("[J-T2] tenant proof refuses %s before membership or locks", async same => {
  const client = recording({ same });
  await expect(new RecoveryCaseRepository(unusedPool()).commandInTransaction(client.db, context, jobId, landing(), reviewer))
    .rejects.toMatchObject({ code: "RECOVERY_JOIN_TENANT_MISMATCH" });
  expect(client.statements).toHaveLength(3);
  expect(client.statements[2]).toEqual({ sql: "SELECT CASE WHEN pg_input_is_valid(current_setting('app.tenant_id', true), 'uuid') THEN nullif(current_setting('app.tenant_id', true), '')::uuid = $1::uuid ELSE false END AS same", values: [tenantId] });
  assertCallerOwned(client);
});
it("[J-R1] identical replay returns a receipt; hash and job conflicts retain merged errors", async () => {
  const input = landing(), first = recording();
  await new RecoveryCaseRepository(unusedPool()).commandInTransaction(first.db, context, jobId, input, reviewer);
  const hash = first.statements.find(s => s.sql.startsWith("INSERT INTO app.recovery_case_event"))!.values[11] as string;
  const replay = { case_id: caseId, payload_hash: hash, job_id: jobId, reviewer_ref: `membership:${reviewer.membershipId}` };
  const client = recording({ replay });
  await expect(new RecoveryCaseRepository(unusedPool()).commandInTransaction(client.db, context, jobId, input, reviewer)).resolves.toEqual({ caseId, replayed: true });
  expect(client.statements).toHaveLength(6);
  expect(client.statements.some(s => s.sql.includes("INSERT") || s.sql.includes("audit"))).toBe(false);
  assertCallerOwned(client);
  for (const row of [{ ...replay, payload_hash: "b".repeat(64) }, { ...replay, job_id: randomUUID() }]) {
    const conflict = recording({ replay: row });
    await expect(new RecoveryCaseRepository(unusedPool()).commandInTransaction(conflict.db, context, jobId, input, reviewer)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
    expect(conflict.statements).toHaveLength(6);
    assertCallerOwned(conflict);
  }
});
