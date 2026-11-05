import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION, assertVatTreatmentIssueAllowed,
  VAT_TREATMENTS_ENABLED } from "@jobguard/core";
import { VatFixtureRepository } from "../src/vat-fixture-repository.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";

describe("M4-21 real PostgreSQL synthetic VAT documents", () => {
  let c: Cluster;
  beforeAll(async () => { c = await cluster(); }, 240000);
  afterAll(async () => { await c?.close(); });
  const company = () => seedWorkJob(c as unknown as WorkFixture);
  type Company = Awaited<ReturnType<typeof company>>;
  function input(a: Company) {
    return { version: "vat.fixture-append.v1", commandId: randomUUID(), jobId: a.jobId,
      book: { version: "vat.fixture-book.v1", matrixVersion: VAT_SUPPORT_MATRIX_VERSION,
        environment: "synthetic", label: VAT_FIXTURE_LABEL, supplierReference: "Fictional supplier",
        customerReference: "Fictional customer", taxBasis: "net_after_retention", roundingVersion: "fixture_cumulative_group_half_up_v1" },
      document: { id: randomUUID(), previousDocumentId: null as string | null, kind: "interim",
        documentReference: randomUUID() as string, documentDate: "2026-11-04", interimCertificationId: randomUUID(),
        retentionProfileId: randomUUID(), retentionReleaseId: null, creditOfDocumentId: null as string | null,
        groups: [{ treatment: "drc_20", cumulativeNetPence: 10000, retainedNetPence: 1000, eligibility: {
          source: "human_fixture", actorId: a.actorId, evidenceId: randomUUID(), supplierVatRegistered: true,
          supplierVatNumber: "fictional-supplier-vat", customerVatRegistered: true, customerVatNumber: "fictional-customer-vat",
          customerEndUser: false, intermediarySupplier: false, constructionReverseChargeInScope: true,
          qualifyingBasisReference: "fictional eligibility, no authority",
        } }],
      } };
  }
  const count = async (a: Company) => (await c.admin.query("SELECT count(*)::int n FROM app.vat_fixture_record WHERE tenant_id=$1", [a.tenantId])).rows[0].n as number;
  it("persists only fixtures, replays once, rejects changed commands and preserves original rows through credit", async () => {
    const a = await company(), repo = new VatFixtureRepository(c.runtime), first = input(a);
    const [result, replay] = await Promise.all([repo.command(a.context, a.actorId, first), repo.command(a.context, a.actorId, first)]);
    expect(replay).toEqual(result); expect(await count(a)).toBe(1);
    await expect(repo.command(a.context, a.actorId, { ...first, document: { ...first.document, documentDate: "2026-11-05" } })).rejects.toMatchObject({ code: "CONFLICT" });
    const credit = structuredClone(first); credit.commandId = randomUUID(); credit.document.id = randomUUID();
    credit.document.previousDocumentId = first.document.id; credit.document.documentReference = "fictional-credit";
    credit.document.kind = "credit_note"; credit.document.creditOfDocumentId = first.document.id;
    credit.document.groups[0]!.cumulativeNetPence = 5000; credit.document.groups[0]!.retainedNetPence = 500;
    await repo.command(a.context, a.actorId, credit);
    const read = await new VatFixtureRepository(c.runtime).read(a.context, a.jobId);
    expect(read.book.documents[0]).toEqual(first.document);
    expect(read.reconciliation.documents[0]?.cumulative).toMatchObject({ net: { pence: 10000 }, vatToSupplier: { pence: 0 },
      reverseChargeVat: { pence: 1800 }, gross: { pence: 10000 }, retained: { pence: 1000 }, expectedCash: { pence: 9000 } });
    expect(read.reconciliation.documents[1]?.delta).toMatchObject({ net: { pence: -5000 }, expectedCash: { pence: -4500 } });
    for (const record of read.records) expect(record).toMatchObject({ matrixVersion: VAT_SUPPORT_MATRIX_VERSION, label: VAT_FIXTURE_LABEL, environment: "synthetic" });
    expect(read.lineage).toBe("fixture lineage, never authority");
    expect(VAT_TREATMENTS_ENABLED).toBe(false); expect(assertVatTreatmentIssueAllowed).toThrow();
  });
  it("does not reuse command identity on another job in the same tenant", async () => {
    const a = await company(), b = await seedWorkJob(c as unknown as WorkFixture, a.tenantId);
    const repo = new VatFixtureRepository(c.runtime), first = input(a);
    await repo.command(a.context, a.actorId, first);
    await expect(repo.command(a.context, a.actorId, { ...first, jobId: b.jobId })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await count(a)).toBe(1);
    await expect(repo.read(a.context, b.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("serializes two appends from one previous document and refuses duplicate references", async () => {
    const a = await company(), repo = new VatFixtureRepository(c.runtime), first = input(a);
    await repo.command(a.context, a.actorId, first);
    const next = () => { const v = structuredClone(first); v.commandId = randomUUID(); v.document.id = randomUUID();
      v.document.documentReference = randomUUID(); v.document.previousDocumentId = first.document.id;
      v.document.groups[0]!.cumulativeNetPence = 20000; return v; };
    const results = await Promise.allSettled([repo.command(a.context, a.actorId, next()), repo.command(a.context, a.actorId, next())]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await count(a)).toBe(2);
    const read = await repo.read(a.context, a.jobId), duplicate = next();
    duplicate.document.previousDocumentId = read.book.documents.at(-1)!.id;
    duplicate.document.documentReference = first.document.documentReference;
    await expect(repo.command(a.context, a.actorId, duplicate)).rejects.toBeInstanceOf(Error);
    expect(await count(a)).toBe(2);
    const b = await company(), one = input(b), two = structuredClone(one);
    two.commandId = randomUUID(); two.document.id = randomUUID();
    const fresh = await Promise.allSettled([repo.command(b.context, b.actorId, one), repo.command(b.context, b.actorId, two)]);
    expect(fresh.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await count(b)).toBe(1);
  });
  it("rolls back missing, unsupported and conflicting eligibility and fixed-field changes", async () => {
    const a = await company(), repo = new VatFixtureRepository(c.runtime), first = input(a);
    for (const change of ["missing", "unsupported", "conflict"]) {
      const v = structuredClone(first);
      if (change === "missing") delete (v.document.groups[0]!.eligibility as Partial<typeof v.document.groups[number]["eligibility"]>).customerEndUser;
      if (change === "unsupported") v.document.groups[0]!.treatment = "unsupported";
      if (change === "conflict") v.document.groups[0]!.eligibility.customerEndUser = true;
      await expect(repo.command(a.context, a.actorId, v)).rejects.toBeInstanceOf(Error); expect(await count(a)).toBe(0);
    }
    await repo.command(a.context, a.actorId, first);
    for (const key of ["taxBasis", "supplierReference", "customerReference"]) {
      const v = structuredClone(first); v.commandId = randomUUID();
      Object.assign(v.book, { [key]: key === "taxBasis" ? "full_net" : "different fictional party" });
      await expect(repo.command(a.context, a.actorId, v)).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(await count(a)).toBe(1);
  });
  it("hides foreign and absent jobs identically, rejects foreign actors, and enforces FORCE RLS", async () => {
    const a = await company(), b = await company(), repo = new VatFixtureRepository(c.runtime);
    await repo.command(a.context, a.actorId, input(a));
    for (const jobId of [a.jobId, randomUUID()]) await expect(repo.read(b.context, jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.command(a.context, b.actorId, input(a))).rejects.toBeInstanceOf(Error);
    await workTenant(c.admin, b.tenantId, async db => {
      await db.query("SET LOCAL ROLE jobguard_migration");
      expect((await db.query("SELECT * FROM app.vat_fixture_record WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([]);
    });
    const routine = (await c.admin.query("SELECT proconfig,prosecdef,pg_get_userbyid(proowner) owner,proacl::text acl FROM pg_proc WHERE oid='app.vat_fixture_records(uuid,uuid,uuid,text,jsonb)'::regprocedure")).rows[0];
    expect(routine).toEqual({ proconfig: ["search_path=pg_catalog"], prosecdef: true, owner: "jobguard_migration",
      acl: "{jobguard_migration=X/jobguard_migration,jobguard_runtime=X/jobguard_migration}" });
    const catalog = (await c.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.vat_fixture_record'::regclass")).rows[0];
    expect(catalog).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    expect(await count(a)).toBe(1); expect(await count(b)).toBe(0);
  });
  it("refuses direct runtime writes, owner updates, deletes and truncation without changing history", async () => {
    const a = await company(), repo = new VatFixtureRepository(c.runtime); await repo.command(a.context, a.actorId, input(a));
    const before = await repo.read(a.context, a.jobId);
    for (const pool of [c.runtime, c.admin]) for (const sql of [
      "UPDATE app.vat_fixture_record SET payload='{}'::jsonb WHERE tenant_id=$1",
      "DELETE FROM app.vat_fixture_record WHERE tenant_id=$1",
    ]) await expect(workTenant(pool, a.tenantId, db => db.query(sql, [a.tenantId]))).rejects.toBeInstanceOf(Error);
    await expect(c.admin.query("TRUNCATE app.vat_fixture_record")).rejects.toBeInstanceOf(Error);
    await expect(workTenant(c.runtime, a.tenantId, db => db.query("INSERT INTO app.vat_fixture_record SELECT * FROM app.vat_fixture_record"))).rejects.toMatchObject({ code: "42501" });
    expect(await repo.read(a.context, a.jobId)).toEqual(before);
  });
  it("keeps production-like databases closed", async () => {
    const other = await cluster(false, "jobguard_vat_closed");
    try {
      const a = await seedWorkJob(other as unknown as WorkFixture), repo = new VatFixtureRepository(other.runtime);
      await expect(repo.command(a.context, a.actorId, input(a))).rejects.toMatchObject({ code: "DISABLED" });
      await expect(repo.read(a.context, a.jobId)).rejects.toMatchObject({ code: "DISABLED" });
      expect((await other.admin.query("SELECT count(*)::int n FROM app.vat_fixture_record")).rows[0].n).toBe(0);
    } finally { await other.close(); }
  }, 240000);
});
