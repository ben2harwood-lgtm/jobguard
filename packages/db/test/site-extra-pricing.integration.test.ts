// ENT-3c: the priced log (LogSiteExtra with a schedule item), against real PostgreSQL. Written before the repository methods it proves.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { extraOriginHashV1, priceSorLine, SorSiteExtraError } from "@jobguard/core";
import { ExtraRepository, SiteExtraRepository, demoSorItems, withTenant, type VerifiedTenantContext, type TenantTransaction } from "../src/index.js";
import { ObservedPool, analyseLockOrder, mutableTables } from "./lock-observer.js";
import { fixture, receipt, rawOrigin, finishRaw } from "./extra-fixtures.js";
import { cluster, siteFixture, command, ownerTx, sorInput, noteText, written, chainHead, rowText, stored, newOrder, reviseOrder, lineIds, newContract, newPriceList, leaveLive, moneyRows, hashOf,
  rawExtra, revisionValues, insertRow, basisValues, type Cluster, type SiteFixture } from "./site-extra-pricing-fixtures.js";
import { invite, smallJob, smallTrack, cancel, originSql, originHashInput, decision } from "./site-extra-fixtures.js";

let c: Cluster, repo: SiteExtraRepository;
beforeAll(async () => { c = await cluster(); repo = new SiteExtraRepository(c.runtime); }, 90_000);
afterAll(async () => { await c?.close(); });
afterEach(() => vi.restoreAllMocks());

const log = (f: SiteFixture, who: { member: SiteFixture["p"] }, jobId: string, fields: Record<string, unknown> = {}) => repo.logSorSiteExtra(f.ctx, who.member, sorInput(jobId, fields));
/** A refusal: the typed SorSiteExtraError, nothing written (the three access refusals may add ENT-3a's own refusal audit event only), chain still valid. */
async function refused(f: SiteFixture, member: SiteFixture["p"], raw: Record<string, unknown>, code: string, context: VerifiedTenantContext = f.ctx) {
  const before = await written(c, f.p.tenantId);
  const error = await repo.logSorSiteExtra(context, member, raw).then(() => { throw new Error("unexpected success"); }, e => e as SorSiteExtraError);
  expect(error).toBeInstanceOf(SorSiteExtraError); expect(error.code).toBe(code); expect(error.message).toBe(code);
  expect(JSON.stringify(error)).not.toContain(noteText);
  expect(await written(c, f.p.tenantId)).toEqual(before); await chainHead(c, f.p.tenantId); return error;
}
const lines = (...items: Array<[string, string, string]>) => items;
const carries = () => lines(["L1", "REPAIR-DOOR", "1"], ["L2", "FIT-LOCK", "2"], ["L3", "CLEAR-GUTTER", "4"]);

/** Structurally valid stored origin and open receipt, without any application authority seam. */
async function directRaise(db: TenantTransaction, f: SiteFixture, who: SiteFixture["members"]["owner"], role: string) {
  const variationId = randomUUID(), scopeId = randomUUID(), tenant = f.p.tenantId;
  const commandId = await receipt(db, tenant, f.jobId, variationId, who.member.membershipId);
  await db.$client.query("INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES($1,$2,$3)", [tenant, f.jobId, scopeId]);
  await insertRow(db, "variation", { tenant_id: tenant, job_id: f.jobId, id: variationId, scope_item_id: scopeId, capture_kind: "text", capture_text: noteText,
    description: "Fictional direct-call extra", job_track: "contractor", origin: "site_user", sor_version_id: f.demo.sorVersionId, sor_code: "CLEAR-GUTTER" });
  const actorFixture = { ...f, p: who.member, grantId: who.grant };
  const origin = await rawOrigin(db, actorFixture, variationId, commandId, { raising_role: role });
  return { variationId, commandId, scopeId, originHash: origin.origin_hash as string, jobId: f.jobId, actorFixture };
}

/** Assert at INSERT, never at COMMIT where an absent basis could mask a missing row guard. */
const assertRevisionInsertRefused = (db: TenantTransaction, values: Record<string, unknown>, expected: RegExp, name: string) =>
  expect(insertRow(db, "extra_sor_revision", values), name).rejects.toMatchObject({ code: expect.stringMatching(expected) });

describe("ENT-3c priced log: success, money and the excess only", () => {
  for (const role of ["operative", "supervisor", "surveyor"] as const) for (const coverage of ["new", "excess"] as const) {
    it(`[C5] ${role} logs a ${coverage} schedule-item extra: one transaction, server-derived facts only`, async () => {
      const f = await siteFixture(c), who = f.members[role], lineFacts = await lineIds(c, f.p.tenantId, f.revisionId);
      const raw = coverage === "new" ? sorInput(f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "1" }) : sorInput(f.jobId, { sorCode: "REPAIR-DOOR", quantity: "3" });
      const free = await repo.logSiteExtra(f.ctx, who.member, { commandId: randomUUID(), jobId: f.jobId, note: "free text", description: "free text extra" });
      const result = await repo.logSorSiteExtra(f.ctx, who.member, raw);
      const rows = (await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, result.variationId])).rows, origin = rows[0]!;
      expect(rows).toHaveLength(1);
      expect(origin).toMatchObject({ kind: "site_user", command_type: "LogSiteExtra", raising_membership_id: who.member.membershipId, raising_role: role, work_order_revision_id: f.revisionId });
      expect(origin.origin_hash).toBe(extraOriginHashV1(originHashInput(origin)));
      const variation = (await c.admin.query("SELECT * FROM app.variation WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, result.variationId])).rows[0]!;
      // The stored description is the schedule item's own, never the caller's.
      expect(variation).toMatchObject({ sor_version_id: f.demo.sorVersionId, sor_code: raw.sorCode, description: coverage === "new" ? "Clear gutters" : "Repair internal door", capture_text: noteText, job_track: "contractor" });
      if (coverage === "excess") {
        expect(variation).toMatchObject({ excess_of_revision_id: f.revisionId, excess_of_scope_item_id: lineFacts.L1!.scopeItemId });
        expect((await c.admin.query("SELECT 1 FROM app.scope_lineage WHERE tenant_id=$1 AND parent_scope_item_id=$2 AND child_scope_item_id=$3 AND kind='variation'", [f.p.tenantId, lineFacts.L1!.scopeItemId, variation.scope_item_id])).rowCount).toBe(1);
      } else expect(variation.excess_of_scope_item_id).toBeNull();
      expect((await c.admin.query("SELECT kind FROM app.extra_event WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, result.variationId])).rows).toEqual([{ kind: "logged" }]);
      const { revision, basis } = await stored(c, f.p.tenantId, result.variationId);
      expect(revision).toBeDefined(); expect(basis).toBeDefined();
      expect(revision.content_hash).toBe(hashOf(revision, origin.origin_hash)); // [C4] the TypeScript mirror equals the stored hash
      expect(revision).toMatchObject({ work_order_id: origin.work_order_id, work_order_revision_id: origin.work_order_revision_id, command_id: raw.commandId, raising_membership_id: who.member.membershipId, coverage });
      expect(basis).toMatchObject({ pricing_basis: "server_sor", revision: 1, revision_content_hash: revision.content_hash, command_id: raw.commandId, actor_membership_id: who.member.membershipId });
      const xmins = await Promise.all([
        c.admin.query("SELECT xmin::text x FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, result.variationId]), c.admin.query("SELECT xmin::text x FROM app.extra_event WHERE tenant_id=$1 AND variation_id=$2", [f.p.tenantId, result.variationId]),
        c.admin.query("SELECT xmin::text x FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.raised'", [f.p.tenantId, result.variationId])]);
      for (const x of xmins) expect(x.rows).toHaveLength(1);
      expect(new Set([...xmins.map(x => x.rows[0]!.x), revision.xmin_text, basis.xmin_text]).size).toBe(1);
      expect((await c.admin.query("SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows).toEqual([{ status: "succeeded" }]);
      const counts = await written(c, f.p.tenantId);
      expect(counts).toMatchObject({ variation_revision: 0, extra_duplicate_link: 0, extra_order_line_link: 0, extra_sor_revision: 1, extra_pricing_basis: 1 });
      expect((await c.admin.query("SELECT kind FROM app.extra_event WHERE tenant_id=$1 AND kind<>'logged'", [f.p.tenantId])).rowCount).toBe(0);
      expect((await c.admin.query("SELECT state FROM app.variation WHERE tenant_id=$1 AND id=ANY($2::uuid[])", [f.p.tenantId, [free.variationId, result.variationId]])).rows.map(r => r.state)).toEqual(["draft", "draft"]);
      await chainHead(c, f.p.tenantId);
    });
  }

  it("[C6] money: every row M1 to M14 stored exactly, equal to merged priceSorLine and to the merged SQL function; M10 is 676 and not 675", async () => {
    const f = await siteFixture(c), who = f.members.supervisor, tenant = f.p.tenantId;
    const plain = await newOrder(c, f, lines(["L1", "FIT-LOCK", "1"])), withLines = await newOrder(c, f, carries());
    const plus = await newOrder(c, f, lines(["L1", "FIT-LOCK", "1"]), { contractId: await newContract(c, f, [f.demo.sorVersionId], "50", "1000") });
    const zero = await newOrder(c, f, lines(["L1", "FIT-LOCK", "1"]), { contractId: await newContract(c, f, [f.demo.sorVersionId], "0", "1") });
    const bigVersion = await newPriceList(c, f, [["BIG-ITEM", "each", 1_000_000_000_000], ["FILLER", "each", 100]], "2026-01-01");
    const big = await newOrder(c, f, lines(["L1", "FILLER", "1"]), { contractId: await newContract(c, f, [bigVersion], "-35", "1000") });
    const rates = new Map<string, number>([...demoSorItems.map(item => [item.code, item.ratePence] as const), ["BIG-ITEM", 1_000_000_000_000]]);
    const report: string[] = [];
    for (const row of moneyRows) {
      const order = row.id.startsWith("M12a") ? plus : row.id.startsWith("M12b") ? zero : row.id.startsWith("M14") ? big : row.order === "carries" ? withLines : plain;
      const raw = sorInput(order.jobId, { sorCode: row.code, quantity: row.claimed }), before = await written(c, tenant);
      if (row.refusal) {
        const error = await repo.logSorSiteExtra(f.ctx, who.member, raw).then(() => { throw new Error(`${row.id}: unexpected success`); }, e => e as SorSiteExtraError);
        expect(error.code, row.id).toBe(row.refusal); expect(await written(c, tenant), row.id).toEqual(before); report.push(`${row.id} refused ${row.refusal}`); continue;
      }
      const result = await repo.logSorSiteExtra(f.ctx, who.member, raw), { revision } = await stored(c, tenant, result.variationId);
      expect(revision.quantity, `${row.id} quantity`).toBe(row.quantity); expect(revision.net_pence, `${row.id} pence`).toBe(row.pence);
      expect(revision.claimed_quantity, `${row.id} claimed`).toBe(row.claimed); expect(revision.instructed_quantity, `${row.id} instructed`).toBe(row.instructed);
      expect(result).toMatchObject({ coverage: row.instructed === null ? "new" : "excess", extraQuantity: row.quantity, instructedQuantity: row.instructed });
      const adjustment = row.adjustment ?? ["-35", "1000"] as [string, string];
      const core = priceSorLine({ version: "sor-line-pricing.v1", quantity: row.quantity, rate: { pence: row.rate ?? rates.get(row.code)!, currency: "GBP" }, adjustment: { numerator: adjustment[0], denominator: adjustment[1] } });
      expect(String(core.pence), `${row.id} merged TypeScript function`).toBe(row.pence);
      const sql = (await c.admin.query("SELECT app.sor_line_net_pence($1,$2,$3,$4)::text AS net", [revision.quantity, revision.rate_pence, revision.adjustment_numerator, revision.adjustment_denominator])).rows[0]!.net;
      expect(sql, `${row.id} merged SQL function`).toBe(row.pence);
      expect([revision.adjustment_numerator, revision.adjustment_denominator], `${row.id} adjustment is the baseline's own`).toEqual(adjustment);
      expect(revision.unit).toBe(row.code === "CLEAR-GUTTER" ? "metre" : row.code === "PAINT-ROOM" ? "room" : "each");
      report.push(`${row.id} ${row.quantity} -> ${revision.net_pence}p`);
    }
    expect(report).toHaveLength(moneyRows.length);
    const m10 = await stored(c, tenant, (await c.admin.query("SELECT variation_id FROM app.extra_sor_revision WHERE tenant_id=$1 AND instructed_quantity='4' AND claimed_quantity='6'", [tenant])).rows[0]!.variation_id);
    expect(m10.revision.net_pence).toBe("676"); expect(m10.revision.net_pence).not.toBe("675");
  }, 120_000);

  it("[C6] a later price list and a later order revision never reprice a stored row; a log after the revision is priced from the new revision's own price list", async () => {
    const f = await siteFixture(c), who = f.members.supervisor, tenant = f.p.tenantId;
    const v2 = await newPriceList(c, f, [["CLEAR-GUTTER", "metre", 1000], ["FIT-LOCK", "each", 4500]], "2026-10-10", f.demo.scheduleId);
    const order = await newOrder(c, f, lines(["L1", "FIT-LOCK", "1"]), { contractId: await newContract(c, f, [f.demo.sorVersionId, v2], "-35", "1000"), issuedOn: "2026-10-08" });
    const first = await log(f, who, order.jobId, { sorCode: "CLEAR-GUTTER", quantity: "1" });
    expect((await stored(c, tenant, first.variationId)).revision).toMatchObject({ net_pence: "338", rate_pence: "350", sor_version_id: f.demo.sorVersionId, work_order_revision_id: order.revisionId });
    const snapshot = await rowText(c, tenant, "extra_sor_revision"), basisSnapshot = await rowText(c, tenant, "extra_pricing_basis");
    const revised = await reviseOrder(c, f, order, lines(["L1", "FIT-LOCK", "1"]), { issuedOn: "2026-10-12" });
    expect(revised.revisionId).not.toBe(order.revisionId);
    expect(await rowText(c, tenant, "extra_sor_revision")).toEqual(snapshot); expect(await rowText(c, tenant, "extra_pricing_basis")).toEqual(basisSnapshot);
    const later = await log(f, who, order.jobId, { sorCode: "CLEAR-GUTTER", quantity: "1" });
    expect((await stored(c, tenant, later.variationId)).revision).toMatchObject({ net_pence: "965", rate_pence: "1000", sor_version_id: v2, work_order_revision_id: revised.revisionId });
    expect((await stored(c, tenant, first.variationId)).revision.net_pence).toBe("338");
  }, 60_000);

  it("[C8] the excess only: the quantity is claimed minus instructed, priced alone, with the BASELINE revision's line", async () => {
    const f = await siteFixture(c), who = f.members.surveyor, facts = await lineIds(c, f.p.tenantId, f.revisionId);
    const result = await log(f, who, f.jobId, { sorCode: "FIT-LOCK", quantity: "5" }), { revision } = await stored(c, f.p.tenantId, result.variationId);
    expect(revision).toMatchObject({ coverage: "excess", instructed_quantity: facts.L2!.quantity, claimed_quantity: "5", quantity: "3", net_pence: "13028", excess_of_scope_item_id: facts.L2!.scopeItemId, work_order_revision_id: f.revisionId });
    expect((await c.admin.query("SELECT excess_of_revision_id,excess_of_scope_item_id FROM app.variation WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, result.variationId])).rows).toEqual([{ excess_of_revision_id: f.revisionId, excess_of_scope_item_id: facts.L2!.scopeItemId }]);
  });

  it("[C7] within the order (equal or below) is ALREADY_ON_ORDER with nothing written, and the same command id then succeeds with a larger quantity", async () => {
    const f = await siteFixture(c), who = f.members.supervisor, commandId = randomUUID();
    for (const quantity of ["1", "0.5", "1.0"]) await refused(f, who.member, sorInput(f.jobId, { commandId, sorCode: "REPAIR-DOOR", quantity }), "ALREADY_ON_ORDER");
    expect((await c.admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, commandId])).rowCount).toBe(0);
    expect((await c.admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.refused'", [f.p.tenantId])).rowCount).toBe(0);
    const result = await repo.logSorSiteExtra(f.ctx, who.member, sorInput(f.jobId, { commandId, sorCode: "REPAIR-DOOR", quantity: "3" }));
    expect((await stored(c, f.p.tenantId, result.variationId)).revision).toMatchObject({ quantity: "2", net_pence: "19300" });
  });
});

describe("ENT-3c access: the same refusals as every command, decided by the database before anything else", () => {
  for (const role of ["owner", "unassigned operative"] as const) {
    it(`[C9] direct runtime writer refuses a structurally valid ${role} origin through its own authority check, with no revision, basis or audit written`, async () => {
      const f = await siteFixture(c), tenant = f.p.tenantId, before = await written(c, tenant), head = await chainHead(c, tenant);
      await expect(withTenant(c.runtime, f.ctx, async db => {
        expect((await db.$client.query("SELECT pg_has_role(current_user,'jobguard_runtime','member') AS runtime")).rows[0]!.runtime).toBe(true);
        const who = role === "owner" ? f.members.owner : f.unassigned;
        const raw = await directRaise(db, f, who, role === "owner" ? "owner" : "operative");
        expect((await db.$client.query("SELECT status,actor_membership_id FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [tenant, raw.commandId])).rows[0]).toEqual({ status: "processing", actor_membership_id: who.member.membershipId });
        expect(raw.originHash).toMatch(/^[a-f0-9]{64}$/u);
        // Require the refusal at the direct function call, before deferred origin/audit constraints can run.
        const error = await db.$client.query("SELECT app.ent3c_record_sor_revision($1,$2,'2',$3)", [f.jobId, raw.variationId, "a".repeat(64)]).then(() => undefined, e => e);
        expect(error).toMatchObject({ code: "P0002", message: "NOT_FOUND" });
        throw error;
      })).rejects.toMatchObject({ code: "P0002", message: "NOT_FOUND" });
      expect(await written(c, tenant)).toEqual(before); expect(await chainHead(c, tenant)).toBe(head);
    });
  }

  it("[C10] direct runtime writer re-checks revoked stored authority and refuses at the call with no revision, basis or audit written", async () => {
    const f = await siteFixture(c), tenant = f.p.tenantId, who = f.members.supervisor;
    const raw = await ownerTx(c, tenant, async db => {
      const raw = await directRaise(db, f, who, "supervisor");
      await finishRaw(db, raw.actorFixture, raw.variationId, raw.commandId, raw.originHash);
      return raw;
    });
    await command(c, f, { kind: "grant.revoke", grantId: who.grant });
    const before = await written(c, tenant), head = await chainHead(c, tenant);
    await expect(withTenant(c.runtime, f.ctx, async db => {
      const error = await db.$client.query("SELECT app.ent3c_record_sor_revision($1,$2,'2',$3)", [f.jobId, raw.variationId, "a".repeat(64)]).then(() => undefined, e => e);
      expect(error).toMatchObject({ code: "P0002", message: "NOT_FOUND" }); throw error;
    })).rejects.toMatchObject({ code: "P0002", message: "NOT_FOUND" });
    expect(await written(c, tenant)).toEqual(before); expect(await chainHead(c, tenant)).toBe(head);
  });

  it("[C11] direct runtime writer refuses without a stored origin or open receipt, with no revision, basis or audit written", async () => {
    const f = await siteFixture(c), tenant = f.p.tenantId, before = await written(c, tenant), head = await chainHead(c, tenant);
    await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT app.ent3c_record_sor_revision($1,$2,'2',$3)", [f.jobId, randomUUID(), "a".repeat(64)]))).rejects.toMatchObject({ code: "P0002", message: "NOT_FOUND" });
    expect(await written(c, tenant)).toEqual(before); expect(await chainHead(c, tenant)).toBe(head);
  });

  it("[C16] direct runtime writer still enforces INVALID_COMMAND (23514) for an authorized stored origin whose raising receipt is no longer open", async () => {
    const f = await siteFixture(c), tenant = f.p.tenantId;
    const result = await log(f, f.members.supervisor, f.jobId, { quantity: "2" });
    const before = await written(c, tenant), head = await chainHead(c, tenant);
    await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT app.ent3c_record_sor_revision($1,$2,'2',$3)", [f.jobId, result.variationId, "a".repeat(64)]))).rejects.toMatchObject({ code: "23514", message: "INVALID_COMMAND" });
    expect(await written(c, tenant)).toEqual(before); expect(await chainHead(c, tenant)).toBe(head);
  });

  it("[C5] direct runtime writer accepts an authorized stored supervisor origin and open receipt with its basis and raised audit in one committing transaction", async () => {
    const f = await siteFixture(c), tenant = f.p.tenantId;
    const raw = await withTenant(c.runtime, f.ctx, async db => {
      const raw = await directRaise(db, f, f.members.supervisor, "supervisor");
      await db.$client.query("SELECT app.ent3c_record_sor_revision($1,$2,'2',$3)", [f.jobId, raw.variationId, "a".repeat(64)]);
      await finishRaw(db, raw.actorFixture, raw.variationId, raw.commandId, raw.originHash);
      await db.$client.query("SET CONSTRAINTS ALL IMMEDIATE"); return raw;
    });
    const { revision, basis } = await stored(c, tenant, raw.variationId);
    expect(revision).toMatchObject({ net_pence: "676", raising_membership_id: f.members.supervisor.member.membershipId });
    expect(basis).toMatchObject({ pricing_basis: "server_sor", revision_content_hash: revision.content_hash });
    expect(await written(c, tenant)).toMatchObject({ extra_sor_revision: 1, extra_pricing_basis: 1, raised: 1 });
    await chainHead(c, tenant);
  });

  it("[C9] every role that may not log gets EXTRA_FORBIDDEN, identical for an in-scope job, another branch's job, another tenant's job and a random job", async () => {
    const f = await siteFixture(c), foreign = await fixture(c), targets = [f.jobId, f.otherJob, foreign.jobId, randomUUID()];
    for (const role of ["owner", "admin", "commercial_manager", "finance", "read_only", "client_approver"] as const) {
      const errors: unknown[] = [], base = sorInput(f.jobId);
      for (const jobId of targets) errors.push(await refused(f, f.members[role].member, { ...base, jobId }, "EXTRA_FORBIDDEN"));
      for (const error of errors) expect(error, role).toEqual(errors[0]);
    }
  });

  it("[C10] every job refusal is one NOT_FOUND whatever the cause, and no caller learns of the price list, the order lines or the item", async () => {
    const f = await siteFixture(c), foreign = await fixture(c), different = await invite(c, f, "surveyor", { kind: "branch", id: f.otherDemo.branchId });
    await command(c, f, { kind: "grant.create", membershipId: different.member.membershipId, role: "supervisor", scope: { kind: "team", id: f.demo.teamId }, contractId: null });
    const probe = (jobId: string) => sorInput(jobId, { sorCode: "NO-SUCH-CODE", quantity: "999", orderLineScopeItemId: randomUUID() }), errors: unknown[] = [];
    for (const [member, jobId] of [[f.members.supervisor.member, randomUUID()], [f.members.supervisor.member, foreign.jobId], [f.members.supervisor.member, await smallJob(c, f)], [f.otherSupervisor.member, f.jobId], [f.otherSurveyor.member, f.jobId], [f.unassigned.member, f.jobId], [different.member, f.jobId]] as const) errors.push(await refused(f, member, probe(jobId), "NOT_FOUND"));
    await command(c, f, { kind: "team.move", membershipId: f.members.operative.member.membershipId, fromTeamId: f.demo.teamId, toTeamId: f.otherDemo.teamId });
    errors.push(await refused(f, f.members.operative.member, probe(f.jobId), "NOT_FOUND"));
    const revoked = await invite(c, f, "supervisor", { kind: "team", id: f.demo.teamId });
    await command(c, f, { kind: "grant.revoke", grantId: revoked.grant }); errors.push(await refused(f, revoked.member, probe(f.jobId), "NOT_FOUND"));
    await cancel(c, f); errors.push(await refused(f, f.members.supervisor.member, probe(f.jobId), "NOT_FOUND"));
    for (const error of errors) expect(error).toEqual(errors[0]);
    await command(c, f, { kind: "membership.revoke", membershipId: f.members.surveyor.member.membershipId });
    await refused(f, f.members.surveyor.member, probe(f.otherJob), "EXTRA_FORBIDDEN");
  }, 60_000);

  it("[C11] another tenant: nothing crosses, nothing of tenant B is read, searched, priced or written", async () => {
    const f = await siteFixture(c), b = await siteFixture(c), small = await siteFixture(c); await smallTrack(c, small);
    const bVersion = await newPriceList(c, b, [["ONLY-B-ITEM", "each", 777]], "2026-01-02", b.demo.scheduleId);
    const bOrder = await newOrder(c, b, lines(["L1", "ONLY-B-ITEM", "1"]), { contractId: await newContract(c, b, [bVersion], "0", "1") });
    const bLine = (await lineIds(c, b.p.tenantId, bOrder.revisionId)).L1!.scopeItemId;
    const bExtra = await log(b, b.members.supervisor, bOrder.jobId, { sorCode: "ONLY-B-ITEM", quantity: "2" });
    const foreignCounts = await written(c, b.p.tenantId), foreignHead = await chainHead(c, b.p.tenantId), foreignRows = await rowText(c, b.p.tenantId, "extra_sor_revision");
    const supervisor = f.members.supervisor.member;
    await refused(f, supervisor, sorInput(b.jobId), "NOT_FOUND");
    await refused(f, supervisor, sorInput(f.jobId, { sorCode: "ONLY-B-ITEM" }), "SOR_ITEM_NOT_FOUND");
    await refused(f, supervisor, sorInput(f.jobId, { sorCode: "REPAIR-DOOR", quantity: "5", orderLineScopeItemId: bLine }), "ORDER_LINE_NOT_FOUND");
    await refused(f, b.members.supervisor.member, sorInput(f.jobId), "EXTRA_FORBIDDEN");
    await refused(f, supervisor, sorInput(small.jobId), "NOT_FOUND");
    const connect = vi.spyOn(c.runtime, "connect");
    for (const bad of [null, { tenantId: f.p.tenantId }]) { connect.mockClear(); await refused(f, supervisor, sorInput(f.jobId), "NOT_FOUND", bad as unknown as VerifiedTenantContext); expect(connect).not.toHaveBeenCalled(); }
    await refused(small, small.members.supervisor.member, sorInput(small.jobId), "TRACK_FORBIDDEN");
    // ENT-3a's stored-origin authority rule refuses tenant B's absent origin in tenant A before any writer constraint.
    const callerCounts = await written(c, f.p.tenantId), callerHead = await chainHead(c, f.p.tenantId);
    await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT app.ent3c_record_sor_revision($1,$2,'1',$3)", [bOrder.jobId, bExtra.variationId, "a".repeat(64)]))).rejects.toMatchObject({ code: "P0002", message: "NOT_FOUND" });
    expect(await written(c, f.p.tenantId)).toEqual(callerCounts); expect(await chainHead(c, f.p.tenantId)).toBe(callerHead);
    expect(await written(c, b.p.tenantId)).toEqual(foreignCounts); expect(await chainHead(c, b.p.tenantId)).toBe(foreignHead); expect(await rowText(c, b.p.tenantId, "extra_sor_revision")).toEqual(foreignRows);
    // Tenant A's runtime role sees none of tenant B's rows in either new table.
    const seen = await withTenant(c.runtime, f.ctx, async db => ({ revisions: (await db.$client.query("SELECT tenant_id FROM app.extra_sor_revision")).rows, basis: (await db.$client.query("SELECT tenant_id FROM app.extra_pricing_basis")).rows }));
    for (const rows of Object.values(seen)) for (const row of rows) expect(row.tenant_id).toBe(f.p.tenantId);
    expect((await written(c, f.p.tenantId)).extra_sor_revision).toBe(0);
  }, 90_000);

  it("[C13] two people logging the same item create two candidate duplicates, each priced in full, never merged", async () => {
    const f = await siteFixture(c), one = await log(f, f.members.supervisor, f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" });
    const two = await log(f, f.members.surveyor, f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" }), three = await log(f, f.members.supervisor, f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" });
    expect(new Set([one.variationId, two.variationId, three.variationId]).size).toBe(3);
    for (const x of [one, two, three]) expect((await stored(c, f.p.tenantId, x.variationId)).revision).toMatchObject({ quantity: "2", net_pence: "676" });
    expect(await written(c, f.p.tenantId)).toMatchObject({ extra_sor_revision: 3, extra_pricing_basis: 3, extra_duplicate_link: 0, variation: 3, extra_origin: 3 });
  });
});

describe("ENT-3c replay, conflict and the six properties the coordinator named (B-prime)", () => {
  it("[C12] replaying a command id returns the first result, never the job's current state", async () => {
    const f = await siteFixture(c), who = f.members.supervisor, raw = sorInput(f.jobId, { sorCode: "REPAIR-DOOR", quantity: "3" }), tenant = f.p.tenantId;
    const first = await repo.logSorSiteExtra(f.ctx, who.member, raw), snapshot = await rowText(c, tenant, "extra_sor_revision");
    // [C12] (a) the order now instructs the item in full, (b) a newer price list exists, (c) the member has a second covering grant.
    await reviseOrder(c, f, { n: 1, reference: "WO-DEMO-0001", jobId: f.jobId, orderId: f.orderId, revisionId: f.revisionId, contractId: f.demo.contractId, revision: 1 }, lines(["L1", "REPAIR-DOOR", "5"], ["L2", "FIT-LOCK", "2"]));
    await newPriceList(c, f, [["REPAIR-DOOR", "each", 99999]], "2026-10-07", f.demo.scheduleId);
    await command(c, f, { kind: "grant.create", membershipId: who.member.membershipId, role: "supervisor", scope: { kind: "branch", id: f.demo.branchId }, contractId: null });
    const before = await written(c, tenant), head = await chainHead(c, tenant); // after the world moved on: the replay itself must add nothing
    expect(await repo.logSorSiteExtra(f.ctx, who.member, raw)).toEqual(first);
    expect(await written(c, tenant)).toEqual(before); expect(await rowText(c, tenant, "extra_sor_revision")).toEqual(snapshot); expect(await chainHead(c, tenant)).toBe(head);
    expect((await c.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [tenant, raw.commandId])).rows).toEqual([{ result: { variationId: first.variationId } }]);
  }, 60_000);

  it("[C12] the same command id with a changed payload conflicts", async () => {
    const f = await siteFixture(c), raw = sorInput(f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" }), me = f.members.supervisor.member, tenant = f.p.tenantId;
    const invitedAgain = await invite(c, f, "supervisor", { kind: "tenant", id: tenant });
    const first = await repo.logSorSiteExtra(f.ctx, me, raw), before = await written(c, tenant), snapshot = await rowText(c, tenant, "extra_sor_revision");
    const changes: Array<[string, Record<string, unknown>, SiteFixture["p"]]> = [["quantity", { quantity: "3" }, me], ["code", { sorCode: "PAINT-ROOM" }, me], ["note", { note: "a different note" }, me], ["named line", { orderLineScopeItemId: randomUUID() }, me], ["member", {}, invitedAgain.member]];
    for (const [name, change, member] of changes) {
      const error = await repo.logSorSiteExtra(f.ctx, member, { ...raw, ...change }).then(() => undefined, e => e as SorSiteExtraError);
      expect(error, name).toBeInstanceOf(SorSiteExtraError); expect(error!.code, name).toBe("IDEMPOTENCY_CONFLICT");
    }
    expect(await written(c, tenant)).toEqual(before); expect(await rowText(c, tenant, "extra_sor_revision")).toEqual(snapshot);
    expect(await repo.logSorSiteExtra(f.ctx, me, raw)).toEqual(first);
    expect((await written(c, tenant)).extra_sor_revision).toBe(1);
    // Free text and priced logs refuse each other's command ids.
    const textual = { commandId: randomUUID(), jobId: f.jobId, note: "free", description: "free extra" };
    await repo.logSiteExtra(f.ctx, me, textual);
    await expect(repo.logSorSiteExtra(f.ctx, me, sorInput(f.jobId, { commandId: textual.commandId, sorCode: "CLEAR-GUTTER" }))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(repo.logSiteExtra(f.ctx, me, { commandId: raw.commandId, jobId: f.jobId, note: noteText, description: "Clear gutters" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  }, 60_000);

  it("[C12] the same command id on another job conflicts", async () => {
    const f = await siteFixture(c), both = (await invite(c, f, "supervisor", { kind: "tenant", id: f.p.tenantId })).member, raw = sorInput(f.jobId, { sorCode: "CLEAR-GUTTER" });
    for (const jobId of [f.jobId, f.otherJob]) expect((await decision(c, f, both, "LogSiteExtra", jobId))[0]!.decision).toBe("allowed");
    const first = await repo.logSorSiteExtra(f.ctx, both, raw), before = await written(c, f.p.tenantId);
    await expect(repo.logSorSiteExtra(f.ctx, both, { ...raw, jobId: f.otherJob })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await written(c, f.p.tenantId)).toEqual(before);
    expect(await repo.logSorSiteExtra(f.ctx, both, raw)).toEqual(first);
  });

  it("[C12] a successful no-op keeps its identity", async () => {
    // The first successful call is not a no-op. The property applies as follows: (1) a replay of the same id and body after success returns the same extra id, the same revision
    // and the same basis and writes nothing new; (2) the draft's "already on the order" outcome logs nothing, so asking again leaves nothing and gives the same refusal each time.
    const f = await siteFixture(c), who = f.members.operative, raw = sorInput(f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "1.5" }), tenant = f.p.tenantId;
    const first = await repo.logSorSiteExtra(f.ctx, who.member, raw), { revision, basis } = await stored(c, tenant, first.variationId), before = await written(c, tenant), head = await chainHead(c, tenant);
    const again = await repo.logSorSiteExtra(f.ctx, who.member, raw), after = await stored(c, tenant, again.variationId);
    expect(again.variationId).toBe(first.variationId); expect(after.revision.id).toBe(revision.id); expect(after.revision.revision).toBe(1); expect(after.revision.content_hash).toBe(revision.content_hash); expect(after.basis.id).toBe(basis.id);
    expect(await written(c, tenant)).toEqual(before); expect(await chainHead(c, tenant)).toBe(head);
    const within = sorInput(f.jobId, { sorCode: "REPAIR-DOOR", quantity: "1" });
    const e1 = await refused(f, who.member, within, "ALREADY_ON_ORDER"), e2 = await refused(f, who.member, within, "ALREADY_ON_ORDER"); expect(e2).toEqual(e1);
  });

  it("[C17] a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written", async () => {
    const f = await siteFixture(c), order = await newOrder(c, f, lines(["L1", "FIT-LOCK", "1"])), raw = sorInput(order.jobId, { sorCode: "CLEAR-GUTTER" });
    await leaveLive(c, f, order.jobId);
    const before = await written(c, f.p.tenantId), head = await chainHead(c, f.p.tenantId);
    // The caller is an allowed member (so authority passes): a supervisor on the demo team.
    expect((await decision(c, f, f.members.supervisor.member, "LogSiteExtra", order.jobId))[0]!.decision).toBe("allowed");
    const error = await repo.logSorSiteExtra(f.ctx, f.members.supervisor.member, raw).then(() => undefined, e => e as SorSiteExtraError);
    expect(error).toBeInstanceOf(SorSiteExtraError); expect(error!.code).toBe("JOB_NOT_LIVE");
    expect(await written(c, f.p.tenantId)).toEqual(before); expect(await chainHead(c, f.p.tenantId)).toBe(head);
    expect((await written(c, f.p.tenantId))).toMatchObject({ extra_sor_revision: 0, extra_pricing_basis: 0, variation: 0, command_receipt: before.command_receipt });
    expect((await c.admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rowCount).toBe(0);
    expect((await c.admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type IN('contractor.extra.raised','contractor.extra.refused') AND subject_ref IN($2,$3)", [f.p.tenantId, raw.commandId, order.jobId])).rowCount).toBe(0);
  });

  it("[C9] an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job", async () => {
    const f = await siteFixture(c), foreign = await fixture(c), notLive = await newOrder(c, f, lines(["L1", "FIT-LOCK", "1"]));
    await leaveLive(c, f, notLive.jobId);
    const targets = [["unknown", randomUUID()], ["foreign", foreign.jobId], ["not-live", notLive.jobId], ["live", f.jobId]] as const;
    expect((await c.admin.query("SELECT id,status FROM app.job WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id", [f.p.tenantId, [f.jobId, notLive.jobId]])).rows.sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([{ id: f.jobId, status: "live" }, { id: notLive.jobId, status: "invoiced" }].sort((a, b) => a.id.localeCompare(b.id)));
    // One caller whose role may not log at all (owner), and one allowed-by-role caller who is not named on the job (an operative off the job): the not-live case proves the guard does not answer first.
    for (const [who, member, code] of [["a role that may not log", f.members.owner.member, "EXTRA_FORBIDDEN"], ["an allowed-by-role operative not named on the job", f.unassigned.member, "NOT_FOUND"]] as const) {
      const errors: SorSiteExtraError[] = [];
      for (const [kind, jobId] of targets) {
        const error = await refused(f, member, sorInput(jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" }), code);
        expect({ code: error.code, message: error.message, kind: undefined }, `${who}: ${kind}`).toEqual({ code, message: code, kind: undefined }); errors.push(error);
      }
      for (const error of errors) expect(error, who).toEqual(errors[0]);
    }
  });
});

describe("ENT-3c live only, races, atomic audit and the immutable record", () => {
  it("[C17] a replay of a command that succeeded while the job was live still returns its first answer after the job has left live; a caller who may not log never learns the job is not live", async () => {
    const f = await siteFixture(c), order = await newOrder(c, f, lines(["L1", "FIT-LOCK", "1"])), me = f.members.supervisor.member, raw = sorInput(order.jobId, { sorCode: "CLEAR-GUTTER" });
    const first = await repo.logSorSiteExtra(f.ctx, me, raw); await leaveLive(c, f, order.jobId);
    const before = await written(c, f.p.tenantId);
    expect(await repo.logSorSiteExtra(f.ctx, me, raw)).toEqual(first); expect(await written(c, f.p.tenantId)).toEqual(before);
    await refused(f, me, sorInput(order.jobId, { sorCode: "PAINT-ROOM" }), "JOB_NOT_LIVE");
    await refused(f, f.members.owner.member, sorInput(order.jobId), "EXTRA_FORBIDDEN");
    await refused(f, f.unassigned.member, sorInput(order.jobId), "NOT_FOUND");
  }, 60_000);

  it("[C14] races: the same command twice at once is one extra with two equal answers; an order revision between the pre-check and the command ends typed or wholly consistent", async () => {
    const f = await siteFixture(c), who = f.members.supervisor, tenant = f.p.tenantId, raw = sorInput(f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" });
    const [a, b] = await Promise.all([repo.logSorSiteExtra(f.ctx, who.member, raw), repo.logSorSiteExtra(f.ctx, who.member, raw)]);
    expect(a).toEqual(b); expect(await written(c, tenant)).toMatchObject({ extra_sor_revision: 1, extra_pricing_basis: 1, variation: 1, extra_origin: 1, raised: 1 });
    // The same id with a different quantity at the same moment: one wins, the other is a conflict, never two rows.
    const racing = sorInput(f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "1" });
    const settled = await Promise.allSettled([repo.logSorSiteExtra(f.ctx, who.member, racing), repo.logSorSiteExtra(f.ctx, who.member, { ...racing, quantity: "3" })]);
    expect(settled.filter(s => s.status === "fulfilled")).toHaveLength(1); expect(settled.filter(s => s.status === "rejected").map(s => (s as PromiseRejectedResult).reason.code)).toEqual(["IDEMPOTENCY_CONFLICT"]);
    expect((await written(c, tenant)).extra_sor_revision).toBe(2);

    // Three shapes of an order revision landing between the pre-check and the command (no sleeps: the revision is committed inside the call that follows the pre-check).
    const original = ExtraRepository.prototype.raiseExtra;
    let moved: Awaited<ReturnType<typeof written>> | undefined;
    const between = (work: () => Promise<unknown>) => vi.spyOn(ExtraRepository.prototype, "raiseExtra").mockImplementationOnce(async function (this: ExtraRepository, context, input, seam) { await work(); moved = await written(c, tenant); return original.call(this, context, input, seam); });
    const consistent = async (jobId: string, orderFor: { revisionId: string }) => {
      for (const row of (await c.admin.query("SELECT r.* FROM app.extra_sor_revision r WHERE r.tenant_id=$1 AND r.job_id=$2", [tenant, jobId])).rows) {
        const o = (await c.admin.query("SELECT work_order_revision_id,origin_hash FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [tenant, row.variation_id])).rows[0]!;
        expect(row.work_order_revision_id).toBe(o.work_order_revision_id);
        if (row.coverage === "excess") expect((await c.admin.query("SELECT 1 FROM app.work_order_line l WHERE l.tenant_id=$1 AND l.revision_id=$2 AND l.scope_item_id=$3 AND l.quantity::numeric=$4::numeric", [tenant, row.work_order_revision_id, row.excess_of_scope_item_id, row.instructed_quantity])).rowCount).toBe(1);
        expect(row.content_hash).toBe(hashOf(row, o.origin_hash));
      }
      expect(orderFor.revisionId).toBeTruthy();
    };
    // (i) the compared line's quantity is raised to cover the claim
    let order = await newOrder(c, f, lines(["L1", "REPAIR-DOOR", "1"], ["L2", "FIT-LOCK", "2"]));
    between(() => reviseOrder(c, f, order, lines(["L1", "REPAIR-DOOR", "5"], ["L2", "FIT-LOCK", "2"])));
    await expect(repo.logSorSiteExtra(f.ctx, who.member, sorInput(order.jobId, { sorCode: "REPAIR-DOOR", quantity: "3" }))).rejects.toMatchObject({ code: "ALREADY_ON_ORDER" });
    expect(await written(c, tenant)).toEqual(moved); await consistent(order.jobId, order);
    // (ii) the compared line is removed
    order = await newOrder(c, f, lines(["L1", "REPAIR-DOOR", "1"], ["L2", "FIT-LOCK", "2"]));
    between(() => reviseOrder(c, f, order, lines(["L2", "FIT-LOCK", "2"])));
    await expect(repo.logSorSiteExtra(f.ctx, who.member, sorInput(order.jobId, { sorCode: "REPAIR-DOOR", quantity: "3" }))).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
    expect(await written(c, tenant)).toEqual(moved); await consistent(order.jobId, order);
    // (iii) a line with the code is added where there was none
    order = await newOrder(c, f, lines(["L2", "FIT-LOCK", "2"]));
    between(() => reviseOrder(c, f, order, lines(["L2", "FIT-LOCK", "2"], ["L3", "CLEAR-GUTTER", "4"])));
    await expect(repo.logSorSiteExtra(f.ctx, who.member, sorInput(order.jobId, { sorCode: "CLEAR-GUTTER", quantity: "1" }))).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
    expect(await written(c, tenant)).toEqual(moved); await consistent(order.jobId, order);
  }, 90_000);

  it("[C14] a grant revoke holding the tenant lock while a log is in flight: the log waits, and is refused with nothing written when the revoke commits first", async () => {
    const f = await siteFixture(c), a = f.members.supervisor, raw = sorInput(f.jobId, { sorCode: "CLEAR-GUTTER" });
    const originalConnect = c.runtime.connect.bind(c.runtime), wrapped = new WeakSet<object>();
    let resume!: () => void, notify!: (pid: number) => void;
    const held = new Promise<void>(r => { resume = r; }), reached = new Promise<number>(r => { notify = r; }); let intercepted = false;
    vi.spyOn(c.runtime, "connect").mockImplementation((async () => {
      const client = await originalConnect(); if (wrapped.has(client)) return client; wrapped.add(client); const original = client.query.bind(client);
      vi.spyOn(client, "query").mockImplementation((async (sql: any, params?: any) => {
        const value = await original(sql, params);
        if (!intercepted && String(sql).includes("SELECT app.contractor_admin_command")) { intercepted = true; notify((client as unknown as { processID: number }).processID); await held; }
        return value;
      }) as any); return client;
    }) as any);
    const revocation = command(c, f, { kind: "grant.revoke", grantId: a.grant }), pid = await reached;
    const logging = repo.logSorSiteExtra(f.ctx, a.member, raw).then(v => ({ value: v }), e => ({ error: e as SorSiteExtraError }));
    try { let blocked = false; for (let i = 0; i < 1000 && !blocked; i++) blocked = (await c.admin.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))", [pid])).rowCount! > 0; expect(blocked).toBe(true); } finally { resume(); }
    const [, outcome] = await Promise.all([revocation, logging]); vi.restoreAllMocks();
    expect((outcome as { error?: SorSiteExtraError }).error).toMatchObject({ code: "NOT_FOUND" });
    expect((await c.admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rowCount).toBe(0);
    expect((await written(c, f.p.tenantId)).extra_sor_revision).toBe(0);
  }, 60_000);

  it("[C14] the job leaving live on a second connection while a log is in flight: the log commits first (the guard holds to commit) and nothing is half written", async () => {
    const f = await siteFixture(c), order = await newOrder(c, f, lines(["L1", "FIT-LOCK", "1"])), a = f.members.supervisor, raw = sorInput(order.jobId, { sorCode: "CLEAR-GUTTER" });
    const originalConnect = c.runtime.connect.bind(c.runtime), wrapped = new WeakSet<object>();
    let resume!: () => void, notify!: (pid: number) => void;
    const held = new Promise<void>(r => { resume = r; }), reached = new Promise<number>(r => { notify = r; }); let intercepted = false;
    vi.spyOn(c.runtime, "connect").mockImplementation((async () => {
      const client = await originalConnect(); if (wrapped.has(client)) return client; wrapped.add(client); const original = client.query.bind(client);
      vi.spyOn(client, "query").mockImplementation((async (sql: any, params?: any) => {
        const value = await original(sql, params);
        if (!intercepted && String(sql).includes("SELECT app.ent3c_record_sor_revision")) { intercepted = true; notify((client as unknown as { processID: number }).processID); await held; }
        return value;
      }) as any); return client;
    }) as any);
    const logging = repo.logSorSiteExtra(f.ctx, a.member, raw).then(v => ({ value: v }), e => ({ error: e as SorSiteExtraError })), pid = await reached;
    const leaving = leaveLive(c, f, order.jobId);
    try { let blocked = false; for (let i = 0; i < 1000 && !blocked; i++) blocked = (await c.admin.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))", [pid])).rowCount! > 0; expect(blocked).toBe(true); } finally { resume(); }
    const [outcome] = await Promise.all([logging, leaving]); vi.restoreAllMocks();
    expect((outcome as { value?: unknown }).value).toBeDefined();
    expect(await written(c, f.p.tenantId)).toMatchObject({ extra_sor_revision: 1, extra_pricing_basis: 1, raised: 1 });
    expect((await c.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, order.jobId])).rows[0]!.status).toBe("invoiced");
  }, 60_000);

  it("[C15] a failure forced at each statement leaves nothing written, and the audit event is in the same transaction", async () => {
    const f = await siteFixture(c), who = f.members.supervisor, tenant = f.p.tenantId;
    const original = ExtraRepository.prototype.raiseExtra;
    for (const fragment of ["INSERT INTO app.command_receipt", "INSERT INTO app.variation", "INSERT INTO app.extra_origin", "INSERT INTO app.extra_event", "SELECT app.require_watchdog_live", "SELECT app.ent3a_require_extra_authority", "SELECT app.ent3c_record_sor_revision", "FROM app.append_audit(", "COMMIT"]) {
      const raw = sorInput(f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" }), before = await written(c, tenant), head = await chainHead(c, tenant);
      vi.spyOn(ExtraRepository.prototype, "raiseExtra").mockImplementationOnce(async function (this: ExtraRepository, context, input, seam) {
        const connect = c.runtime.connect.bind(c.runtime), spy = vi.spyOn(c.runtime, "connect");
        spy.mockImplementation((async () => { const client = await connect(); const original = client.query.bind(client); const q = vi.spyOn(client, "query");
          q.mockImplementation((async (sql: any, params?: any) => { const value = await original(sql, params); if (String(sql).includes(fragment) && fragment !== "COMMIT") throw new Error(noteText); return value; }) as any);
          if (fragment === "COMMIT") q.mockImplementation((async (sql: any, params?: any) => { if (sql === "COMMIT") { await original("SET CONSTRAINTS ALL IMMEDIATE"); throw new Error(noteText); } return original(sql, params); }) as any);
          return client; }) as any);
        try { return await original.call(this, context, input, seam); } finally { spy.mockRestore(); }
      });
      const error = await repo.logSorSiteExtra(f.ctx, who.member, raw).then(() => undefined, e => e as SorSiteExtraError);
      expect(error, fragment).toBeInstanceOf(SorSiteExtraError); expect(JSON.stringify(error)).not.toContain(noteText);
      expect(await written(c, tenant), fragment).toEqual(before); expect(await chainHead(c, tenant), fragment).toBe(head);
      expect((await c.admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [tenant, raw.commandId])).rowCount, fragment).toBe(0);
      vi.restoreAllMocks();
    }
    // No business lock is taken after the audit append (the merged lock observer, real PostgreSQL).
    const observed = new ObservedPool(c.runtime, c.admin), ownership = { mutable: await mutableTables(c.admin) }, observedRepo = new SiteExtraRepository(observed.pool);
    const { transactions } = await observed.record(() => observedRepo.logSorSiteExtra(f.ctx, who.member, sorInput(f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" })));
    const committed = transactions.filter(t => t.outcome === "commit" && t.statements.some(s => s.sql.includes("ent3c_record_sor_revision")));
    expect(committed).toHaveLength(1);
    const analysis = analyseLockOrder(committed[0]!, ownership); expect(analysis.auditIndex).toBeDefined(); expect(analysis.afterAudit).toEqual([]);
    // A raised audit in a different transaction identity cannot authorize this revision; an EARLIER committed extra is refused at insert.
    await expect(ownerTx(c, tenant, async db => {
      const raw = await rawExtra(db, f, { jobId: f.jobId, code: "CLEAR-GUTTER", savepoint: true });
      // The raise sits in a released savepoint: its facts carry another transaction id than the revision row, so the price is not in the raising transaction.
      const values = await revisionValues(db, f, raw, { claimed: "2" }); const row = await insertRow(db, "extra_sor_revision", values);
      await insertRow(db, "extra_pricing_basis", basisValues(f, raw, row.content_hash as string));
      await db.$client.query("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toMatchObject({ message: "PRICING_AUDIT_REQUIRED" });
    const earlier = await repo.logSorSiteExtra(f.ctx, who.member, sorInput(f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "3" }));
    await expect(ownerTx(c, tenant, async db => {
      const o = (await db.$client.query("SELECT * FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [tenant, earlier.variationId])).rows[0]!;
      const raw = { variationId: earlier.variationId, commandId: o.command_id as string, scopeId: "", originHash: o.origin_hash as string, jobId: f.jobId };
      await insertRow(db, "extra_sor_revision", await revisionValues(db, f, raw, { claimed: "3" }, { id: randomUUID() }));
    })).rejects.toMatchObject({ code: expect.stringMatching(/^(23505|23514)$/u) });
  }, 120_000);

  it("[C15] matching origin/revision transaction identities and a valid basis still require the raised audit event: PRICING_AUDIT_REQUIRED rolls everything back", async () => {
    const f = await siteFixture(c), tenant = f.p.tenantId, before = await written(c, tenant), head = await chainHead(c, tenant);
    await expect(ownerTx(c, tenant, async db => {
      const raw = await rawExtra(db, f, { jobId: f.jobId, code: "CLEAR-GUTTER", audit: false });
      const row = await insertRow(db, "extra_sor_revision", await revisionValues(db, f, raw, { claimed: "2" }));
      await insertRow(db, "extra_pricing_basis", basisValues(f, raw, row.content_hash as string));
      const xmins = (await db.$client.query(`SELECT o.xmin::text AS origin_xid,r.xmin::text AS revision_xid,b.xmin::text AS basis_xid
        FROM app.extra_origin o JOIN app.extra_sor_revision r ON(r.tenant_id,r.variation_id)=(o.tenant_id,o.variation_id)
        JOIN app.extra_pricing_basis b ON(b.tenant_id,b.variation_id)=(r.tenant_id,r.variation_id) WHERE o.tenant_id=$1 AND o.variation_id=$2`, [tenant, raw.variationId])).rows[0]!;
      expect(xmins.origin_xid).toBe(xmins.revision_xid); expect(xmins.basis_xid).toBe(xmins.revision_xid);
      expect((await db.$client.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.raised'", [tenant, raw.variationId])).rowCount).toBe(0);
      await db.$client.query("SET CONSTRAINTS app.sor_revision_basis IMMEDIATE");
      // Force this constraint alone: an origin's own deferred audit failure must not stand in for the pricing audit rule.
      const error = await db.$client.query("SET CONSTRAINTS app.sor_revision_audit IMMEDIATE").then(() => undefined, e => e);
      expect(error).toMatchObject({ code: "23514", message: "PRICING_AUDIT_REQUIRED" }); throw error;
    })).rejects.toMatchObject({ code: "23514", message: "PRICING_AUDIT_REQUIRED" });
    expect(await written(c, tenant)).toEqual(before); expect(await chainHead(c, tenant)).toBe(head);
  });

  it("[C16] a correct owner-inserted revision commits with its basis and raised audit, so tamper refusals are isolated to the revision INSERT", async () => {
    const f = await siteFixture(c), tenant = f.p.tenantId;
    const raw = await ownerTx(c, tenant, async db => {
      const raw = await rawExtra(db, f, { jobId: f.jobId, code: "CLEAR-GUTTER" });
      const row = await insertRow(db, "extra_sor_revision", await revisionValues(db, f, raw, { claimed: "2" }));
      await insertRow(db, "extra_pricing_basis", basisValues(f, raw, row.content_hash as string));
      await db.$client.query("SET CONSTRAINTS ALL IMMEDIATE"); return raw;
    });
    const { revision, basis } = await stored(c, tenant, raw.variationId);
    expect(revision).toMatchObject({ quantity: "2", net_pence: "676" });
    expect(basis).toMatchObject({ revision_content_hash: revision.content_hash, pricing_basis: "server_sor" });
    expect(await written(c, tenant)).toMatchObject({ extra_sor_revision: 1, extra_pricing_basis: 1, raised: 1 });
    await chainHead(c, tenant);
  });

  it("[C16] the stored record cannot be changed or supplied, and every tampered row is refused by the guard or a foreign key", async () => {
    const f = await siteFixture(c), who = f.members.supervisor, tenant = f.p.tenantId, result = await log(f, who, f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" });
    const { revision } = await stored(c, tenant, result.variationId);
    for (const [name, sql] of [["update net", "UPDATE app.extra_sor_revision SET net_pence=1"], ["update quantity", "UPDATE app.extra_sor_revision SET quantity='9'"], ["update any column", "UPDATE app.extra_sor_revision SET unit='x'"], ["delete", "DELETE FROM app.extra_sor_revision"]] as const) {
      await expect(withTenant(c.runtime, f.ctx, db => db.$client.query(sql)), `runtime ${name}`).rejects.toMatchObject({ code: "42501" });
      await expect(ownerTx(c, tenant, db => db.$client.query(sql)), `owner ${name}`).rejects.toMatchObject({ code: "55000" });
    }
    await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("TRUNCATE app.extra_sor_revision"))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(c.runtime, f.ctx, db => insertRow(db, "extra_sor_revision", { ...Object.fromEntries(Object.entries(revision).filter(([key]) => key !== "xmin_text")), id: randomUUID() }))).rejects.toMatchObject({ code: "42501" });
    // Tampered rows offered as the table owner inside a transaction shaped like a real raise (the guard binds the owner too).
    const tamper = async (name: string, shape: { claimed: string; quantity?: string }, overrides: Record<string, unknown>, expected: RegExp) => {
      const before = await written(c, tenant), head = await chainHead(c, tenant);
      await ownerTx(c, tenant, async db => {
        await db.$client.query("SAVEPOINT tamper_case");
        try {
          const raw = await rawExtra(db, f, { jobId: f.jobId, code: "CLEAR-GUTTER" });
          await assertRevisionInsertRefused(db, await revisionValues(db, f, raw, shape, overrides), expected, name);
        } finally { await db.$client.query("ROLLBACK TO SAVEPOINT tamper_case"); }
      });
      expect(await written(c, tenant), name).toEqual(before); expect(await chainHead(c, tenant), name).toBe(head);
    };
    const high = (await c.admin.query("SELECT (app.sor_line_net_pence('2',350,-35,1000)+1)::text AS n")).rows[0]!.n as string, low = (await c.admin.query("SELECT (app.sor_line_net_pence('2',350,-35,1000)-1)::text AS n")).rows[0]!.n as string;
    await tamper("one penny high", { claimed: "2" }, { net_pence: high }, /^23514$/u);
    await tamper("one penny low", { claimed: "2" }, { net_pence: low }, /^23514$/u);
    await tamper("another rate", { claimed: "2" }, { rate_pence: "351" }, /^(23514|23503)$/u); // the guard (net is not the exact price of that rate) or the schedule-item foreign key
    await tamper("another unit", { claimed: "2" }, { unit: "each" }, /^(23514|23503)$/u);
    await tamper("another adjustment", { claimed: "2" }, { adjustment_numerator: "-34" }, /^23514$/u);
    const differentBaseline = await newOrder(c, f, lines(["L1", "FIT-LOCK", "1"]));
    expect(differentBaseline.revisionId).not.toBe(f.revisionId);
    await tamper("another baseline", { claimed: "2" }, { work_order_revision_id: differentBaseline.revisionId }, /^(23514|23503)$/u);
    await tamper("another member", { claimed: "2" }, { raising_membership_id: f.members.supervisor.member.membershipId }, /^23514$/u);
    await tamper("an extra quantity that is not claimed minus instructed", { claimed: "2", quantity: "3" }, {}, /^23514$/u);
    await tamper("new for a code the baseline carries", { claimed: "1" }, { sor_code: "FIT-LOCK", sor_version_id: f.demo.sorVersionId }, /^(23514|23503)$/u);
    // A supplied content hash and time are overwritten; a second row for the same extra fails on the unique rule.
    await ownerTx(c, tenant, async db => {
      const raw = await rawExtra(db, f, { jobId: f.jobId, code: "CLEAR-GUTTER" });
      const row = await insertRow(db, "extra_sor_revision", await revisionValues(db, f, raw, { claimed: "2" }, { content_hash: "c".repeat(64), server_recorded_at: "1999-01-01T00:00:00Z" }));
      const origin = (await db.$client.query("SELECT origin_hash,server_recorded_at FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [tenant, raw.variationId])).rows[0]!;
      expect(row.content_hash).not.toBe("c".repeat(64)); expect(row.content_hash).toBe(hashOf(row, origin.origin_hash)); expect(new Date(row.server_recorded_at).getTime()).toBe(new Date(origin.server_recorded_at).getTime());
      await insertRow(db, "extra_pricing_basis", basisValues(f, raw, row.content_hash as string));
      await db.$client.query("SAVEPOINT second");
      await expect(insertRow(db, "extra_sor_revision", await revisionValues(db, f, raw, { claimed: "2" }))).rejects.toMatchObject({ code: expect.stringMatching(/^(23505|23514)$/u) });
      await db.$client.query("ROLLBACK TO SAVEPOINT second");
    }).catch(error => { if (!/PRICING_AUDIT_REQUIRED|INVALID_ORIGIN/u.test(String(error?.message))) throw error; });
    // The routine called directly as the runtime role: committed extra, free-text extra, NULL, zero and malformed arguments.
    const free = await repo.logSiteExtra(f.ctx, who.member, { commandId: randomUUID(), jobId: f.jobId, note: "free", description: "free extra" });
    const direct = (variation: string, quantity: string | null, hash: string | null) => withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT app.ent3c_record_sor_revision($1,$2,$3,$4)", [f.jobId, variation, quantity, hash]));
    const before = await written(c, tenant);
    await expect(direct(result.variationId, "2", "a".repeat(64))).rejects.toMatchObject({ message: "INVALID_COMMAND" });
    await expect(direct(free.variationId, "2", "a".repeat(64))).rejects.toMatchObject({ message: "INVALID_COMMAND" });
    for (const [quantity, hash, message] of [[null, "a".repeat(64), "INVALID_QUANTITY"], ["0", "a".repeat(64), "INVALID_QUANTITY"], ["0.0", "a".repeat(64), "INVALID_QUANTITY"], ["1e3", "a".repeat(64), "INVALID_QUANTITY"], ["2", "short", "INVALID_COMMAND"], ["2", null, "INVALID_COMMAND"], ["2", "A".repeat(64), "INVALID_COMMAND"]] as const) {
      await expect(direct(result.variationId, quantity, hash), `${quantity} ${hash}`).rejects.toMatchObject({ message });
    }
    expect(await written(c, tenant)).toEqual(before);
  }, 90_000);

  it("[C16] the high/low INSERT-refusal assertions fail if only the exact-price guard is removed (rolled-back mutation control)", async () => {
    const f = await siteFixture(c), tenant = f.p.tenantId, before = await written(c, tenant), head = await chainHead(c, tenant);
    const functionText = async () => (await c.admin.query("SELECT pg_get_functiondef('app.ent3c_sor_revision_guard()'::regprocedure) AS definition")).rows[0]!.definition as string;
    const original = await functionText();
    const priceGuard = / IF NEW\.net_pence IS DISTINCT FROM app\.sor_line_net_pence\(NEW\.quantity,NEW\.rate_pence,NEW\.adjustment_numerator,NEW\.adjustment_denominator\) THEN\s+RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';\s+END IF;/gu;
    expect(original.match(priceGuard)).toHaveLength(1);
    await expect(ownerTx(c, tenant, async db => {
      // Change only this piece's price predicate; every structural, basis and audit control remains enabled.
      await db.$client.query(original.replace(priceGuard, ""));
      for (const [name, offset] of [["one penny high", 1], ["one penny low", -1]] as const) {
        const raw = await rawExtra(db, f, { jobId: f.jobId, code: "CLEAR-GUTTER" });
        const price = (await db.$client.query("SELECT (app.sor_line_net_pence('2',350,-35,1000)+$1)::text AS n", [offset])).rows[0]!.n as string;
        const values = await revisionValues(db, f, raw, { claimed: "2" }, { net_pence: price });
        // The SAME assertion used above must fail now, at INSERT, rather than pass on a later missing-basis error.
        await expect(assertRevisionInsertRefused(db, values, /^23514$/u, name)).rejects.toMatchObject({ name: "AssertionError" });
        const row = (await db.$client.query("SELECT * FROM app.extra_sor_revision WHERE tenant_id=$1 AND id=$2", [tenant, values.id])).rows[0]!;
        expect(row.net_pence).toBe(price);
        await insertRow(db, "extra_pricing_basis", basisValues(f, raw, row.content_hash as string));
      }
      await db.$client.query("SET CONSTRAINTS ALL IMMEDIATE");
      throw new Error("ROLLBACK_PRICE_GUARD_CONTROL");
    })).rejects.toThrow("ROLLBACK_PRICE_GUARD_CONTROL");
    expect(await functionText()).toBe(original);
    expect(await written(c, tenant)).toEqual(before); expect(await chainHead(c, tenant)).toBe(head);
  });
});
