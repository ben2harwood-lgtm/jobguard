// Rule 9: own migration alone; then later migrations twice. Canonical named columns, full types and original row identities.
// NOT RUN by the builder: PostgreSQL cannot start in this sandbox.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { buildEvidenceManifest, canonicalManifest, manifestDigest, renderStandalonePack, sha256, verifyStandalonePack } from "@jobguard/core";
import { MIGRATION_URLS, migrate } from "../src/index.js";
import { loadEvidencePackSources } from "../src/evidence-pack-sources.js";
import { approvalFixture, cluster, ownerTx, type ApprovalFixture } from "./extra-approval-fixtures.js";
import { clusterBefore } from "./site-extra-pricing-fixtures.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { proofBefore, proofColumns, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";

const own = "0147_extra_approval.sql", name = (u: URL) => fileURLToPath(u).split("/").at(-1)!;
const compared = ["app.variation", "app.variation_revision", "app.variation_approval", "app.extra_origin", "app.extra_event", "app.extra_sor_revision", "app.extra_pricing_basis", "app.work_order_revision", "app.work_order_line", "app.sor_item", "app.command_receipt", "app.audit_event", "app.evidence_object", "app.evidence_upload", "app.evidence_pack", "app.evidence_pack_revision", "app.quote_document_version", "app.quote_acceptance", "app.customer_invoice", "app.material_rate_revision", "app.supplier_document", "app.supplier_document_version", "app.recovery_claim_revision"];
let c: Awaited<ReturnType<typeof clusterBefore>>, f: ApprovalFixture, before: Awaited<ReturnType<typeof proofBefore>>;
let artifact: string, digest: string, recoveryCount: number;
let allColumns: Record<string, { name: string; type: string }[]>;
async function columnCatalog(): Promise<Record<string, { name: string; type: string }[]>> {
  const tables = (await c.admin.query("SELECT n.nspname||'.'||t.relname name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE t.relkind='r' AND n.nspname IN('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1")).rows;
  return Object.fromEntries(await Promise.all(tables.map(async t => [t.name as string, await proofColumns(c.admin, t.name as string)])));
}
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await clusterBefore(own); f = await approvalFixture(c);
  const recovery = await seedEvidencePackFixture(c.admin);
  await ownerTx(c, recovery.tenantId, async db => {
    const loaded = await loadEvidencePackSources(db, recovery.tenantId, recovery.caseId);
    const manifest = buildEvidenceManifest(recovery.caseId, recovery.jobId, loaded.sources, loaded.omissions);
    artifact = renderStandalonePack(manifest, loaded.sources); digest = manifestDigest(manifest);
    const pack = randomUUID();
    await db.$client.query("INSERT INTO app.evidence_pack(tenant_id,id,job_id,case_id) VALUES($1,$2,$3,$4)", [recovery.tenantId, pack, recovery.jobId, recovery.caseId]);
    await db.$client.query(`INSERT INTO app.evidence_pack_revision(tenant_id,id,job_id,case_id,pack_id,revision,command_id,canonical_manifest,manifest_hash,content_hash,sources,format,actor_ref,subject_hash,artifact_text)
      VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,$10,'TEXT','fixture-owner',$11,$12)`, [recovery.tenantId, randomUUID(), recovery.jobId, recovery.caseId, pack, randomUUID(), canonicalManifest(manifest), digest, sha256(artifact), JSON.stringify(loaded.sources), sha256("legacy subject fixture"), artifact]);
  });
  before = await proofBefore(c.admin, compared);
  allColumns = await columnCatalog();
  recoveryCount = (await c.admin.query("SELECT count(*)::int n FROM app.recovery_case")).rows[0]!.n as number;
  for (const table of compared) expect(Object.keys(before[table]!.rows).length, `${table} has pre-existing rows`).toBeGreaterThan(0);
}, 180_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("E5-26 rule-9 upgrade proof", async () => {
  const ownUrl = MIGRATION_URLS.find(u => name(u) === own); expect(ownUrl).toBeDefined();
  const columns = Object.fromEntries(await Promise.all(compared.map(async t => [t, await proofColumns(c.admin, t)])));
  const functions = (await c.admin.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app'")).rows;
  await c.admin.query(await readFile(ownUrl!, "utf8"));
  await c.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [own]);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  const atOwn = await columnCatalog();
  for (const [table, columnsBefore] of Object.entries(allColumns)) expect(atOwn[table], table).toEqual(columnsBefore);
  expect(Object.keys(atOwn).filter(t => !(t in allColumns)).sort()).toEqual(["app.extra_approval_revision_binding", "app.extra_evidence_pack"]);
  for (const table of compared) expect(await proofColumns(c.admin, table)).toEqual(columns[table]);
  for (const old of functions) expect((await c.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [old.signature])).rows[0]!.definition).toBe(old.definition);
  await migrate(c.admin); await migrate(c.admin);
  const afterAllColumns = await columnCatalog();
  for (const [table, columnsBefore] of Object.entries(allColumns)) for (const column of columnsBefore) expect(afterAllColumns[table]?.find(now => now.name === column.name), `${table}.${column.name}`).toEqual(column);
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r => r.migration_name)).toEqual(MIGRATION_URLS.map(name).sort());
});
it("E5-20 existing pack and fingerprint compatibility", async () => {
  const rows = (await c.admin.query("SELECT artifact_text,manifest_hash,content_hash FROM app.evidence_pack_revision WHERE manifest_hash=$1", [digest])).rows;
  expect(rows).toHaveLength(1); expect(rows[0]!.artifact_text).toBe(artifact); expect(rows[0]!.manifest_hash).toBe(digest); expect(rows[0]!.content_hash).toBe(sha256(artifact));
  expect(verifyStandalonePack(rows[0]!.artifact_text)).toEqual(verifyStandalonePack(artifact));
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.recovery_case")).rows[0]!.n).toBe(recoveryCount);
});
it("E5-26 one-microsecond and full-type changes FAIL using the same comparator", async () => {
  await rolledBack(c.admin, async db => {
    await db.query("SET LOCAL session_replication_role=replica");
    await db.query("UPDATE app.audit_event SET occurred_at=occurred_at+interval '1 microsecond' WHERE tenant_id=$1 AND sequence=(SELECT min(sequence) FROM app.audit_event WHERE tenant_id=$1)", [f.p.tenantId]);
    expect((await proofDifferences(db, before)).rows.some(r => r.startsWith("app.audit_event"))).toBe(true);
  });
  await rolledBack(c.admin, async db => {
    await db.query("ALTER TABLE app.sor_item ALTER COLUMN standard_minutes TYPE bigint");
    expect((await proofDifferences(db, before)).types).toContain("app.sor_item: standard_minutes integer -> bigint");
  });
  expect(await proofDifferences(c.admin, before)).toEqual({ rows: [], types: [] });
});
it("E5-26 later nullable column replaced function and added row PASS using the same comparator", async () => {
  await rolledBack(c.admin, async db => {
    await db.query("ALTER TABLE app.sor_item ADD COLUMN ent5_control_nullable text");
    expect(await scratchReplaceFunction(db, "app.sor_line_net_pence(text,bigint,bigint,bigint)")).toBe(true);
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
    await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'LogSiteExtra',$3,$4,'processing',$5)", [f.p.tenantId, randomUUID(), `control:${randomUUID()}`, "a".repeat(64), f.p.membershipId]);
    expect(await proofDifferences(db, before)).toEqual({ rows: [], types: [] });
  });
});
it("E5-26 fresh installation succeeds twice", async () => {
  const fresh = await cluster();
  try { await migrate(fresh.admin); await migrate(fresh.admin); expect((await fresh.admin.query("SELECT to_regclass('app.extra_approval_revision_binding')::text n")).rows[0]!.n).toBe("app.extra_approval_revision_binding"); }
  finally { await fresh.close(); }
}, 180_000);
