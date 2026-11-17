// ENT-3c pricing basis (ruling A1): the side record beside each priced revision. Written before the code it proves.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SiteExtraRepository, withTenant } from "../src/index.js";
import { cluster, siteFixture, ownerTx, sorInput, written, stored, rawExtra, revisionValues, insertRow, basisValues, type Cluster, type SiteFixture } from "./site-extra-pricing-fixtures.js";

let c: Cluster, repo: SiteExtraRepository, f: SiteFixture;
beforeAll(async () => { c = await cluster(); repo = new SiteExtraRepository(c.runtime); f = await siteFixture(c); }, 90_000);
afterAll(async () => { await c?.close(); });

/** Offer a correct raw extra and revision to `work` in a transaction shaped like a real raise; the transaction is the caller's to finish or break. */
const hand = <T>(work: (db: Parameters<Parameters<typeof ownerTx>[2]>[0], raw: Awaited<ReturnType<typeof rawExtra>>, row: Record<string, any>) => Promise<T>, shape = { claimed: "2" }) =>
  ownerTx(c, f.p.tenantId, async db => {
    const raw = await rawExtra(db, f, { jobId: f.jobId, code: "CLEAR-GUTTER" });
    const row = await insertRow(db, "extra_sor_revision", await revisionValues(db, f, raw, shape));
    return work(db, raw, row);
  });

describe("ENT-3c pricing basis", () => {
  it("[C24] beside each version: every revision has exactly one basis row of server_sor, same extra, hash, command, actor, time and transaction; the answer's priceSource is the stored value", async () => {
    for (const [role, fields] of [["operative", { sorCode: "CLEAR-GUTTER", quantity: "1" }], ["supervisor", { sorCode: "REPAIR-DOOR", quantity: "3" }], ["surveyor", { sorCode: "PAINT-ROOM", quantity: "0.5" }]] as const) {
      const result = await repo.logSorSiteExtra(f.ctx, f.members[role].member, sorInput(f.jobId, fields));
      expect(result.priceSource).toBe("server_sor");
      const { revision, basis } = await stored(c, f.p.tenantId, result.variationId);
      expect(basis).toMatchObject({ tenant_id: revision.tenant_id, job_id: revision.job_id, variation_id: revision.variation_id, revision: 1, pricing_basis: "server_sor", revision_content_hash: revision.content_hash, command_id: revision.command_id, actor_membership_id: revision.raising_membership_id });
      expect(new Date(basis.server_recorded_at).getTime()).toBe(new Date(revision.server_recorded_at).getTime()); expect(basis.xmin_text).toBe(revision.xmin_text);
    }
    const unmatched = await c.admin.query("SELECT r.id FROM app.extra_sor_revision r WHERE r.tenant_id=$1 AND (SELECT count(*) FROM app.extra_pricing_basis b WHERE (b.tenant_id,b.variation_id,b.revision)=(r.tenant_id,r.variation_id,r.revision) AND b.pricing_basis='server_sor' AND b.revision_content_hash=r.content_hash)<>1", [f.p.tenantId]);
    expect(unmatched.rowCount).toBe(0);
    expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_pricing_basis b WHERE b.tenant_id=$1 AND NOT EXISTS(SELECT 1 FROM app.extra_sor_revision r WHERE (r.tenant_id,r.variation_id)=(b.tenant_id,b.variation_id))", [f.p.tenantId])).rows[0]!.n).toBe(0);
  });

  it("[C25] a revision committed with no basis row fails at commit with PRICING_BASIS_REQUIRED", async () => {
    await expect(hand(async () => undefined)).rejects.toMatchObject({ message: "PRICING_BASIS_REQUIRED" });
    await expect(hand(async (db, raw, row) => { await insertRow(db, "extra_pricing_basis", basisValues(f, raw, row.content_hash)); })).resolves.toBeUndefined();
  });

  it("[C25] a basis row with no revision beside it, another value, another revision, hash, command or member is refused; a second row for the same extra fails on the unique rule", async () => {
    const refusedBasis = async (overrides: (hash: string) => Record<string, unknown>, expected: RegExp, name: string) => {
      await expect(hand(async (db, raw, row) => { await insertRow(db, "extra_pricing_basis", basisValues(f, raw, row.content_hash, overrides(row.content_hash))); }), name).rejects.toMatchObject({ code: expect.stringMatching(expected) });
    };
    await refusedBasis(() => ({ pricing_basis: "surveyor_quoted" }), /^23514$/u, "surveyor_quoted");
    await refusedBasis(() => ({ pricing_basis: "unpriced" }), /^23514$/u, "unpriced");
    await refusedBasis(() => ({ pricing_basis: "something_else" }), /^23514$/u, "any other text");
    await refusedBasis(() => ({ revision: 2 }), /^23514$/u, "revision 2");
    await refusedBasis(() => ({ revision_content_hash: "d".repeat(64) }), /^23514$/u, "another hash");
    await refusedBasis(() => ({ command_id: "00000000-0000-4000-8000-000000000009" }), /^(23514|23503)$/u, "another command");
    await refusedBasis(() => ({ actor_membership_id: f.members.supervisor.member.membershipId }), /^23514$/u, "another member");
    // No revision beside it.
    await expect(ownerTx(c, f.p.tenantId, async db => { const raw = await rawExtra(db, f, { jobId: f.jobId, code: "CLEAR-GUTTER" }); await insertRow(db, "extra_pricing_basis", basisValues(f, raw, "e".repeat(64))); })).rejects.toMatchObject({ code: "23514" });
    // A second basis row for the same extra and revision.
    await expect(hand(async (db, raw, row) => { await insertRow(db, "extra_pricing_basis", basisValues(f, raw, row.content_hash)); await insertRow(db, "extra_pricing_basis", basisValues(f, raw, row.content_hash)); })).rejects.toMatchObject({ code: expect.stringMatching(/^(23505|23514)$/u) });
  });

  it("[C25] UPDATE, DELETE, TRUNCATE and INSERT fail for the runtime role; UPDATE and DELETE fail for the owner", async () => {
    await repo.logSorSiteExtra(f.ctx, f.members.supervisor.member, sorInput(f.jobId, { sorCode: "CLEAR-GUTTER", quantity: "2" }));
    for (const sql of ["UPDATE app.extra_pricing_basis SET pricing_basis='unpriced'", "UPDATE app.extra_pricing_basis SET revision_content_hash=repeat('0',64)", "DELETE FROM app.extra_pricing_basis", "TRUNCATE app.extra_pricing_basis"]) {
      await expect(withTenant(c.runtime, f.ctx, db => db.$client.query(sql)), `runtime ${sql}`).rejects.toMatchObject({ code: "42501" });
      if (!sql.startsWith("TRUNCATE")) await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql)), `owner ${sql}`).rejects.toMatchObject({ code: "55000" });
    }
    await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("INSERT INTO app.extra_pricing_basis(tenant_id,id,job_id,variation_id,revision,pricing_basis,revision_content_hash,command_id,actor_membership_id,server_recorded_at) SELECT tenant_id,gen_random_uuid(),job_id,variation_id,revision+1,pricing_basis,revision_content_hash,command_id,actor_membership_id,server_recorded_at FROM app.extra_pricing_basis"))).rejects.toMatchObject({ code: "42501" });
  });

  it("[C26] no row of app.variation_revision is written by anything in this piece", async () => {
    expect((await written(c, f.p.tenantId)).variation_revision).toBe(0);
    await repo.logSorSiteExtra(f.ctx, f.members.surveyor.member, sorInput(f.jobId, { sorCode: "FIT-LOCK", quantity: "4" }));
    expect((await written(c, f.p.tenantId)).variation_revision).toBe(0);
    expect((await c.admin.query("SELECT 1 FROM app.variation WHERE tenant_id=$1 AND current_revision_id IS NOT NULL", [f.p.tenantId])).rowCount).toBe(0);
  });
});
