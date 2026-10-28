import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EnterpriseFeeRepository, withTenant } from "../src/index.js";
import { cluster, code, world, type World } from "./contractor-billing-fixtures.js";

// CI ONLY. ENT-7a: stored agreement versions and the locked, finance-only derivation (migration 0276).
let c: Awaited<ReturnType<typeof cluster>>;
beforeAll(async () => { c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); });

// Operations records agreement versions through the owner connection only (no runtime writer).
async function agreement(w: World, rate: [string, string] = ["1", "10"], effectiveFrom = "2000-01-01T00:00:00Z") {
  const id = randomUUID();
  await c.admin.query(`INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
    VALUES($1,$2,'fictional-agreement',$3,$4,'on_payment','enterprise_site_capture_policy_v1',$5,false,$6,'synthetic_demo','operations:fictional')`,
    [w.w.p.tenantId, id, rate[0], rate[1], effectiveFrom, "c".repeat(64)]);
  return id;
}
const period = async () => (await c.admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0].p as string;
async function paid(w: World) {
  await w.repo.import(w.ctx, w.session, w.s.jobId, w.importInput([await w.invoice(), w.event("paid", { effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: `r-${randomUUID()}`, amount: { netPence: 41667, vatPence: 8333, grossPence: 50000 } })]));
}
const derive = (w: World, agreementVersionId: string, p: string, commandId = randomUUID()) =>
  new EnterpriseFeeRepository(c.runtime).derive(w.ctx, w.session, { version: "enterprise-fee-derive.v1", commandId, agreementVersionId, period: p });

it("ENT-F2 on PostgreSQL: the site extra contributes Q = 250000/31 pence, the order line nothing; 10% rounds half-even to 806p", async () => {
  const w = await world(c), id = await agreement(w), p = await period();
  await paid(w);
  const result = await derive(w, id, p);
  expect(result.replayed).toBe(false);
  const read = await new EnterpriseFeeRepository(c.runtime).read(w.ctx, w.session, result.derivationId);
  expect(read.qualifyingPrincipal).toEqual({ numerator: "250000", denominator: "31" });
  expect(read.cumulativeFeePence).toBe(806);
  expect(read.contributions).toHaveLength(1);
  expect(read.contributions[0]).toMatchObject({ extraId: w.s.extraId, originKind: "site_user", qualifyingPrincipal: { numerator: "250000", denominator: "31" } });
  const audit = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='enterprise_fee.derived' AND subject_ref=$2", [w.w.p.tenantId, result.derivationId])).rows[0].n;
  expect(audit).toBe(1);
});

it("unexported and unpaid extras contribute zero", async () => {
  const w = await world(c), id = await agreement(w), p = await period();
  const before = await derive(w, id, p);
  expect((await new EnterpriseFeeRepository(c.runtime).read(w.ctx, w.session, before.derivationId)).contributions).toEqual([]);
  await w.exported();
  const exportedOnly = await derive(w, id, p);
  const read = await new EnterpriseFeeRepository(c.runtime).read(w.ctx, w.session, exportedOnly.derivationId);
  expect(read).toMatchObject({ qualifyingPrincipal: { numerator: "0", denominator: "1" }, cumulativeFeePence: 0, contributions: [] });
});

it("replays and concurrent derivations record once; the same command with a different request conflicts", async () => {
  const w = await world(c), id = await agreement(w), p = await period();
  await paid(w);
  const command = randomUUID();
  const first = await derive(w, id, p, command);
  expect(await derive(w, id, p, command)).toEqual({ derivationId: first.derivationId, replayed: true });
  const racing = await Promise.all([derive(w, id, p), derive(w, id, p)]);
  for (const r of racing) expect(r.derivationId).toBe(first.derivationId);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.enterprise_fee_derivation WHERE tenant_id=$1", [w.w.p.tenantId])).rows[0].n).toBe(1);
  const [year, month] = p.split("-").map(Number) as [number, number];
  const other = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  expect(await code(derive(w, id, other, command))).toBe("COMMAND_CONFLICT");
});

it("only finance may derive or read; an unknown session and a missing agreement are refused", async () => {
  const w = await world(c), id = await agreement(w), p = await period();
  const repo = new EnterpriseFeeRepository(c.runtime);
  expect(await code(repo.derive(w.ctx, randomUUID(), { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: id, period: p }))).toBe("EXTRA_FORBIDDEN");
  const own = await derive(w, id, p);
  expect(await code(repo.read(w.ctx, randomUUID(), own.derivationId))).toBe("EXTRA_FORBIDDEN");
  expect(await code(derive(w, randomUUID(), p))).toBe("FEE_NOT_FOUND");
  expect(await code(repo.derive(w.ctx, w.session, { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: id, period: "2026-13" }))).toBe("INVALID_FEE_INPUT");
});

it("the runtime role cannot read or write fee tables directly, and stored rows are immutable even for the owner", async () => {
  const w = await world(c), id = await agreement(w), p = await period();
  await paid(w);
  const { derivationId } = await derive(w, id, p);
  for (const sql of [
    "SELECT * FROM app.enterprise_fee_derivation",
    "SELECT * FROM app.enterprise_fee_contribution",
    "SELECT * FROM app.enterprise_agreement_version",
    `INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref) VALUES('${w.w.p.tenantId}','${randomUUID()}','x',1,1,'on_payment','enterprise_site_capture_policy_v1',now(),false,'${"d".repeat(64)}','synthetic_demo','x')`,
    `UPDATE app.enterprise_fee_derivation SET cumulative_fee_pence=0 WHERE id='${derivationId}'`,
    `DELETE FROM app.enterprise_fee_contribution WHERE derivation_id='${derivationId}'`,
  ]) await expect(withTenant(c.runtime, w.ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
  await expect(withTenant(c.runtime, w.ctx, db => db.$client.query("SELECT app.ef_actor($1)", [w.session]))).rejects.toMatchObject({ code: "42501" });
  await expect(c.admin.query("UPDATE app.enterprise_fee_derivation SET cumulative_fee_pence=1 WHERE id=$1", [derivationId])).rejects.toMatchObject({ message: "ENTERPRISE_FEE_IMMUTABLE" });
  await expect(c.admin.query("DELETE FROM app.enterprise_agreement_version WHERE id=$1", [id])).rejects.toMatchObject({ message: "ENTERPRISE_FEE_IMMUTABLE" });
});

it("an agreement version only takes extras whose origin time selects it", async () => {
  const w = await world(c), early = await agreement(w, ["1", "10"], "2000-01-01T00:00:00Z"), p = await period();
  await paid(w);
  // A later version effective before the extra's origin replaces the earlier one for that extra.
  const later = await agreement(w, ["1", "20"], "2001-01-01T00:00:00Z");
  const repo = new EnterpriseFeeRepository(c.runtime);
  expect((await repo.read(w.ctx, w.session, (await derive(w, early, p)).derivationId)).contributions).toEqual([]);
  const read = await repo.read(w.ctx, w.session, (await derive(w, later, p)).derivationId);
  expect(read).toMatchObject({ qualifyingPrincipal: { numerator: "250000", denominator: "31" }, cumulativeFeePence: 403 });
});
