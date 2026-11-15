import { testActorContext } from "./tenant-context-test-utils.js";
// PostgreSQL CI coverage; the builder sandbox cannot start PostgreSQL.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { manifestDigest, inspectExtraSourcePack, verifyExtraSourcePack } from "@jobguard/core";
import { ExtraEvidencePackWriter } from "../src/extra-evidence-pack-writer.js";
import { assembleExtraSourcePack } from "../src/extra-evidence-pack-repository.js";
import { loadExtraEvidenceSources } from "../src/extra-evidence-pack-sources.js";
import { withTenant, verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
import { ExtraApprovalRepository } from "../src/index.js";
import { chainWorld, cluster, submitted, approveInput, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";
import { approvalFixture, storage } from "./extra-approval-fixtures.js";

let c: Cluster, w: ChainWorld;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); w = await chainWorld(c); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
async function bound(member: AuthenticatedMembership) {
  const credential = randomBytes(32).toString("hex");
  await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [member.identityUserId, member.tenantId, member.membershipId]);
  await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [`${member.identityUserId}@fictional.invalid`, member.identityUserId]);
  await c.admin.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(), member.identityUserId, credential]);
  return verifiedTenantContextFromMembership(member, { kind: "real", credential });
}
async function specimen() {
  const s = await submitted(c, w, 150000), context = await bound(w.members.surveyor.member);
  const query = { version: "extra-source-query.v1", jobId: s.jobId, extraId: s.extraId };
  const loaded = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, query));
  const pack = await assembleExtraSourcePack(loaded, storage);
  const input = { version: "create-extra-evidence-pack.v1", commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId,
    expectedManifestDigest: manifestDigest(pack.integrity.manifest) };
  return { s, context, query, loaded, pack, input, writer: new ExtraEvidencePackWriter(c.runtime, storage) };
}
it("stores an actor-bound immutable snapshot, replays exactly, and uses the merged verifier", async () => {
  const f = await specimen(), created = await f.writer.create(f.context, f.input);
  const row = (await c.admin.query(`SELECT a.*,p.actor_membership_id container_actor,p.command_id container_command
    FROM app.extra_pack_artifact a JOIN app.extra_evidence_pack p ON(p.tenant_id,p.id)=(a.tenant_id,a.pack_id)
    WHERE a.tenant_id=$1 AND a.pack_id=$2`, [w.p.tenantId, created.packId])).rows[0]!;
  expect(row.manifest_digest).toBe(manifestDigest(f.pack.integrity.manifest));
  expect(row.artifact).toEqual(f.pack);
  expect(row.source_references).toEqual(f.pack.integrity.manifest.entries);
  expect(row.actor_membership_id).toBe(w.members.surveyor.member.membershipId);
  expect(row.container_actor).toBe(row.actor_membership_id);
  expect(row.container_command).toBe(f.input.commandId);
  expect(row.artifact.completeApprovalPack).toBe(false);
  expect(verifyExtraSourcePack(JSON.stringify(row.artifact), { trustedManifestDigest: row.manifest_digest }).findings).not.toContain("Content hash mismatch");
  expect(inspectExtraSourcePack(row.artifact, f.pack.integrity.sources.map((source, i) => i ? source : { ...source, content: "altered" })).findings).toContain("Content hash mismatch");
  expect(inspectExtraSourcePack(row.artifact, f.pack.integrity.sources.slice(1)).findings).toContain("Missing original source");
  expect(await f.writer.create(f.context, f.input)).toEqual(created);
  await expect(f.writer.create(f.context, { ...f.input, expectedManifestDigest: "a".repeat(64) })).rejects.toMatchObject({ code: "EXTRA_PACK_COMMAND_CONFLICT" });
  await new ExtraApprovalRepository(c.runtime).approveExtraStep(await testActorContext(c.admin, await w.ctx, w.members.supervisor.member), w.members.supervisor.member, approveInput(f.s, 0));
  expect(await f.writer.create(f.context, f.input)).toEqual(created);
  const current = await withTenant(c.runtime, f.context, db => loadExtraEvidenceSources(db, f.query));
  const nextPack = await assembleExtraSourcePack(current, storage);
  const next = await f.writer.create(f.context, { ...f.input, commandId: randomUUID(), expectedManifestDigest: manifestDigest(nextPack.integrity.manifest) });
  expect(next.packId).not.toBe(created.packId);
  for (const sql of ["UPDATE app.extra_pack_artifact SET content_version=content_version WHERE tenant_id=$1 AND pack_id=$2", "DELETE FROM app.extra_pack_artifact WHERE tenant_id=$1 AND pack_id=$2"]) {
    // Owner credential proves the trigger, rather than only runtime's missing DML grants.
    await expect(c.admin.query(sql, [w.p.tenantId, created.packId])).rejects.toMatchObject({ code: "55000" });
    await expect(withTenant(c.runtime, f.context, db => db.$client.query(sql, [w.p.tenantId, created.packId]))).rejects.toMatchObject({ code: "42501" });
  }
  expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_pack_artifact WHERE tenant_id=$1 AND command_id=$2", [w.p.tenantId, f.input.commandId])).rows[0]!.n).toBe(1);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='extra.evidence_pack.stored' AND payload->'references'->>'commandId'=$2", [w.p.tenantId, f.input.commandId])).rows[0]!.n).toBe(1);
});
it("refuses wrong digests, roles, grants, tenant, subject, unbound context and client content", async () => {
  const f = await specimen();
  await expect(f.writer.create(f.context, { ...f.input, expectedManifestDigest: "0".repeat(64) })).rejects.toMatchObject({ code: "EXTRA_PACK_DIGEST_MISMATCH" });
  for (const member of [w.members.operative.member, w.otherSurveyor.member]) {
    await expect(f.writer.create(await bound(member), f.input)).rejects.toMatchObject({ code: "EXTRA_PACK_FORBIDDEN" });
  }
  const foreign = await chainWorld(c);
  await expect(f.writer.create(await bound(foreign.members.surveyor.member), f.input)).rejects.toMatchObject({ code: "EXTRA_PACK_FORBIDDEN" });
  await expect(f.writer.create(f.context, { ...f.input, jobId: w.otherJob })).rejects.toMatchObject({ code: "EXTRA_PACK_FORBIDDEN" });
  await expect(f.writer.create(await w.ctx, f.input)).rejects.toMatchObject({ code: "EXTRA_PACK_FORBIDDEN" });
  await expect(f.writer.create(f.context, { ...f.input, artifact: f.pack })).rejects.toMatchObject({ code: "EXTRA_PACK_INVALID_COMMAND" });
  const commercial = await bound(w.members.commercial_manager.member);
  expect(await f.writer.create(commercial, f.input)).toMatchObject({ manifestDigest: f.input.expectedManifestDigest });
  await expect(f.writer.create(f.context, f.input)).rejects.toMatchObject({ code: "EXTRA_PACK_COMMAND_CONFLICT" });
});
it("refuses revoked membership on new creation and replay", async () => {
  const local = await chainWorld(c), s = await submitted(c, local, 150000), member = local.members.surveyor.member;
  const context = await bound(member), writer = new ExtraEvidencePackWriter(c.runtime, storage);
  const loaded = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: s.jobId, extraId: s.extraId }));
  const artifact = await assembleExtraSourcePack(loaded, storage);
  const input = { version: "create-extra-evidence-pack.v1", commandId: randomUUID(), jobId: s.jobId, extraId: s.extraId, expectedManifestDigest: manifestDigest(artifact.integrity.manifest) };
  await writer.create(context, input);
  await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [member.tenantId, member.membershipId]);
  await expect(writer.create(context, input)).rejects.toThrow();
  await expect(writer.create(context, { ...input, commandId: randomUUID() })).rejects.toThrow();
});
it("collapses simultaneous command replay to one stored artifact", async () => {
  const f = await specimen();
  const results = await Promise.all([f.writer.create(f.context, f.input), f.writer.create(f.context, f.input)]);
  expect(results[0]).toEqual(results[1]);
});

it("refuses unavailable originals and invalidated persisted evidence without storing a receipt", async () => {
  const f = await approvalFixture(c), context = await bound(f.members.surveyor.member);
  const query = { version: "extra-source-query.v1", jobId: f.jobId, extraId: f.captured.variationId };
  const loaded = await withTenant(c.runtime, context, db => loadExtraEvidenceSources(db, query));
  const artifact = await assembleExtraSourcePack(loaded, storage);
  const input = { version: "create-extra-evidence-pack.v1", commandId: randomUUID(), jobId: f.jobId, extraId: f.captured.variationId, expectedManifestDigest: manifestDigest(artifact.integrity.manifest) };
  const missing = new ExtraEvidencePackWriter(c.runtime, { ...storage, readExactVersion: async () => { throw new Error("missing original"); } });
  await expect(missing.create(context, input)).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
  const { invalidate } = await import("./site-extra-evidence-fixtures.js");
  await invalidate(c, f, f.original.id);
  await expect(new ExtraEvidencePackWriter(c.runtime, storage).create(context, input)).rejects.toMatchObject({ code: "EXTRA_SOURCE_INVALID" });
  expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, input.commandId])).rows[0]!.n).toBe(0);
});

// Exercise the SQL guard directly after real authentication; the repository intentionally accepts no artifact.
type Pack = Awaited<ReturnType<typeof specimen>>["pack"];
type Specimen = Awaited<ReturnType<typeof specimen>>;
const storeSql = "SELECT app.store_extra_pack_artifact($1,$2,$3,$4,$5::jsonb) result";
const storeArgs = (f: Specimen, artifact: Pack, commandId: string) =>
  [commandId, f.s.jobId, f.s.extraId, manifestDigest(artifact.integrity.manifest), JSON.stringify(artifact)];
function hiddenSourcePack(f: Specimen) {
  const artifact = structuredClone(f.pack), entry = artifact.integrity.manifest.entries[0]!;
  const source = artifact.integrity.sources.find(s => s.sourceId === entry.sourceId && s.version === entry.version)!;
  artifact.integrity.manifest.entries = [entry, structuredClone(entry)];
  artifact.integrity.sources = [source, { ...source, sourceId: "fictional-unmatched", jobId: w.otherJob, content: "unmatched content" }];
  return artifact;
}
async function assertInvalidPack(f: Specimen, artifact: Pack) {
  const commandId = randomUUID();
  await expect(withTenant(c.runtime, f.context, db => db.$client.query(storeSql, storeArgs(f, artifact, commandId))))
    .rejects.toMatchObject({ code: "23514", message: "EXTRA_PACK_INVALID_COMMAND" });
  const counts = await c.admin.query(`SELECT
    (SELECT count(*)::int FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2) receipt,
    (SELECT count(*)::int FROM app.extra_evidence_pack WHERE tenant_id=$1 AND command_id=$2) container,
    (SELECT count(*)::int FROM app.extra_pack_artifact WHERE tenant_id=$1 AND command_id=$2) artifact,
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'commandId'=$2::text) audit`,
  [w.p.tenantId, commandId]);
  expect(counts.rows[0]).toEqual({ receipt: 0, container: 0, artifact: 0, audit: 0 });
}
it("SQL refuses duplicate entries hiding an unmatched wrong-job source atomically", async () => {
  const f = await specimen();
  await assertInvalidPack(f, hiddenSourcePack(f));
});
it("SQL refuses duplicate source pairs, extra/missing sources, wrong job and wrong hash", async () => {
  const f = await specimen();
  expect(f.pack.integrity.sources.length).toBeGreaterThan(1);
  const duplicate = structuredClone(f.pack);
  duplicate.integrity.sources[1] = structuredClone(duplicate.integrity.sources[0]!);
  await assertInvalidPack(f, duplicate);
  for (const change of ["extra", "missing", "job", "hash", "version"] as const) {
    const artifact = structuredClone(f.pack), source = artifact.integrity.sources[0]!;
    if (change === "extra") artifact.integrity.sources.push({ ...source, sourceId: "fictional-extra" });
    if (change === "missing") artifact.integrity.sources.pop();
    if (change === "job") source.jobId = w.otherJob;
    if (change === "hash") source.content += " altered";
    if (change === "version") source.version += 100;
    await assertInvalidPack(f, artifact);
  }
});
it("SQL accepts permuted arrays and separate versions of one source ID, then replays exactly", async () => {
  const f = await specimen(), artifact = structuredClone(f.pack);
  const source = artifact.integrity.sources[0]!, entry = artifact.integrity.manifest.entries.find(e => e.sourceId === source.sourceId && e.version === source.version)!;
  artifact.integrity.sources.push({ ...source, version: source.version + 100 });
  artifact.integrity.manifest.entries.push({ ...entry, version: source.version + 100 });
  artifact.integrity.sources.reverse(); // Correspondence is by identity, not position.
  const commandId = randomUUID(), call = () => withTenant(c.runtime, f.context, db => db.$client.query(storeSql, storeArgs(f, artifact, commandId)));
  const created = (await call()).rows[0]!.result;
  expect(created).toMatchObject({ version: "extra-evidence-pack-stored.v1", manifestDigest: manifestDigest(artifact.integrity.manifest) });
  expect((await call()).rows[0]!.result).toEqual(created);
  expect((await c.admin.query("SELECT artifact FROM app.extra_pack_artifact WHERE tenant_id=$1 AND command_id=$2", [w.p.tenantId, commandId])).rows[0]!.artifact).toEqual(artifact);
});
it("mutation: removing only the new validation breaks the duplicate-entry refusal and rolls back", async () => {
  const f = await specimen(), artifact = hiddenSourcePack(f), commandId = randomUUID();
  const definitionSql = "SELECT pg_get_functiondef('app.store_extra_pack_artifact(uuid,uuid,uuid,text,jsonb)'::regprocedure) sql";
  const original = (await c.admin.query(definitionSql)).rows[0]!.sql as string;
  const mutant = original.replace(/ -- LATER-SAFETY-146:.*? -- End LATER-SAFETY-146 validation\.\n/su, "");
  expect(mutant).not.toBe(original);
  const rollback = new Error("scratch mutation rollback");
  await expect(withTenant(c.admin, f.context, async db => {
    await db.$client.query(mutant);
    await db.$client.query("SET LOCAL ROLE jobguard_runtime");
    const accepted = db.$client.query(storeSql, storeArgs(f, artifact, commandId));
    expect((await accepted).rows[0]!.result).toMatchObject({ version: "extra-evidence-pack-stored.v1" });
    // This is the same refusal assertion as the regression, which must fail under mutation.
    await expect(expect(accepted)
      .rejects.toMatchObject({ code: "23514", message: "EXTRA_PACK_INVALID_COMMAND" })).rejects.toThrow();
    throw rollback;
  })).rejects.toBe(rollback);
  expect((await c.admin.query(definitionSql)).rows[0]!.sql).toBe(original);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [w.p.tenantId, commandId])).rows[0]!.n).toBe(0);
  await assertInvalidPack(f, artifact);
});
