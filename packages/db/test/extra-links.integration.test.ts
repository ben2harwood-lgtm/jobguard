// Written first; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { extraOriginHashV1 } from "@jobguard/core";
import { ExtraRepository, appendAuditBatch, withTenant, auditPayloadV1Schema, verifyAuditChain, type AuditEvent } from "../src/index.js";
import { cluster, fixture, raise, rawVariation, receipt, rawOrigin, linkInput, orderInput, laterRevision, visitAndEvidence, originSql, originHashInput, ownerTx, noteCanary, descriptionCanary, type Cluster, type Fixture } from "./extra-fixtures.js";
let c: Cluster, repo: ExtraRepository;
beforeAll(async () => { c = await cluster(); repo = new ExtraRepository(c.runtime); }, 60_000);
afterAll(async () => { await c?.close(); });
async function extras(f: Fixture) { return Promise.all([repo.raiseExtra(f.ctx, raise(f)), repo.raiseExtra(f.ctx, raise(f, { commandType: "RecordOfficeExtra" })), repo.raiseExtra(f.ctx, raise(f))]); }
async function verifiedHead(f: Fixture) {
 const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.p.tenantId])).rows;
 verifyAuditChain(rows.map(r => ({ id: r.id, version: r.version, tenantId: r.tenant_id, sequence: Number(r.sequence), actorRef: r.actor_ref, eventType: r.event_type, subjectType: r.subject_type, subjectRef: r.subject_ref, occurredAt: r.occurred_at, payload: r.payload, payloadHash: r.payload_hash, previousHash: r.previous_hash, eventHash: r.event_hash })) as AuditEvent[]);
 return (await c.admin.query("SELECT sequence::text,event_hash FROM audit_control.audit_head WHERE tenant_id=$1", [f.p.tenantId])).rows;
}
async function rawLink(f: Fixture, duplicate: string, canonical: string, fields: Record<string, unknown> = {}, audit = true) {
 return withTenant(c.runtime, f.ctx, async db => {
  const id = randomUUID(), commandId = randomUUID(), command = await receipt(db, f.p.tenantId, f.jobId, duplicate, f.p.membershipId, "MarkDuplicate", commandId, { semanticKey: `extra-duplicate:${f.jobId}:${duplicate}:${canonical}:${commandId}` });
  const entries = Object.entries({ tenant_id: f.p.tenantId, id, job_id: f.jobId, duplicate_id: duplicate, canonical_id: canonical, kind: "link", command_id: command, actor_membership_id: f.p.membershipId, ...fields });
  await db.$client.query(`INSERT INTO app.extra_duplicate_link(${entries.map(([k]) => k).join(",")}) VALUES(${entries.map((_, i) => `$${i + 1}`).join(",")})`, entries.map(([, v]) => v));
  if (audit) await appendAuditBatch(db, [{ id, version: "audit.v1", actorRef: `membership:${f.p.membershipId}`, eventType: fields.kind === "unlink" ? "contractor.extra.duplicate_unlinked" : "contractor.extra.duplicate_linked", subjectType: "extra", subjectRef: duplicate, payload: { references: { command, job: f.jobId, duplicate, canonical, link: id, environment: "synthetic_demo" } } }]); return id;
 });
}
async function exported(f: Fixture, variationId: string) { await ownerTx(c, f.p.tenantId, async db => { const command = await receipt(db, f.p.tenantId, f.jobId, variationId, f.p.membershipId, "FinaliseExportBatch"); await db.$client.query("INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id) VALUES($1,$2,$3,$4,'exported',$5,$6)", [f.p.tenantId, randomUUID(), f.jobId, variationId, command, f.p.membershipId]); }); }
describe("ENT-4b immutable links", () => {
 it("[DW1] all new table rows refuse mutation as runtime and migration owner", async () => {
  const f = await fixture(c), [a, b] = await extras(f); await repo.linkDuplicate(f.ctx, linkInput(f, a!.variationId, b!.variationId)); await repo.linkOrderLine(f.ctx, orderInput(f, a!.variationId, await laterRevision(c, f)));
  for (const table of ["extra_event", "extra_duplicate_link", "extra_order_line_link"]) for (const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`, `DELETE FROM app.${table}`]) {
   await expect(withTenant(c.runtime, f.ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
   await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql))).rejects.toMatchObject({ code: "55000" });
  }
 });
 it("[DW4a] composite foreign keys reject cross-tenant and same-tenant wrong-job links/evidence", async () => {
  const f = await fixture(c), other = await fixture(c), [a] = await extras(f), [b] = await extras(other);
  await expect(rawLink(f, a!.variationId, b!.variationId)).rejects.toMatchObject({ code: "23503" });
  // A second imported job in the SAME tenant (the keys must bind job as well as tenant).
  const { WorkOrderRepository, demoFile, demoRow } = await import("../src/index.js");
  await new WorkOrderRepository(c.runtime).importCsv(f.p, { commandId: randomUUID(), kind: "csv", name: "other-job.csv", csv: demoFile([demoRow(f.demo, 2)]) });
  const j = (await c.admin.query("SELECT id,job_id FROM app.work_order WHERE tenant_id=$1 AND id<>$2", [f.p.tenantId, f.orderId])).rows[0];
  const revision = (await c.admin.query("SELECT revision_id FROM app.work_order_current WHERE tenant_id=$1 AND work_order_id=$2", [f.p.tenantId, j.id])).rows[0];
  const sameTenant = { ...f, jobId: j.job_id as string, orderId: j.id as string, revisionId: revision.revision_id as string };
  const d = await repo.raiseExtra(f.ctx, raise(sameTenant)); await expect(rawLink(f, a!.variationId, d.variationId)).rejects.toMatchObject({ code: "23503" });
  for (const foreign of [other, sameTenant]) {
   const line = (await c.admin.query("SELECT * FROM app.work_order_line WHERE tenant_id=$1 AND work_order_id=$2 LIMIT 1", [foreign.p.tenantId, foreign.orderId])).rows[0];
   await expect(withTenant(c.runtime, f.ctx, async db => { const command = await receipt(db, f.p.tenantId, f.jobId, a!.variationId, f.p.membershipId, "RecordClientInstruction", randomUUID(), { semanticKey: `extra-order-line:${f.jobId}:${a!.variationId}` }); await db.$client.query("INSERT INTO app.extra_order_line_link(tenant_id,id,job_id,variation_id,work_order_id,revision_id,scope_item_id,command_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [f.p.tenantId, randomUUID(), f.jobId, a!.variationId, line.work_order_id, line.revision_id, line.scope_item_id, command, f.p.membershipId]); })).rejects.toMatchObject({ code: "23503" });
   const proof = await visitAndEvidence(c, foreign);
   for (const column of ["evidence_id", "resident_confirmation_evidence_id", "site_visit_id"]) await expect(withTenant(c.runtime, f.ctx, async db => { const id = randomUUID(), command = await receipt(db, f.p.tenantId, f.jobId, id, f.p.membershipId); await rawVariation(db, f.p.tenantId, f.jobId, id); await rawOrigin(db, f, id, command, { [column]: column === "site_visit_id" ? proof.visitId : proof.evidenceId }); })).rejects.toMatchObject({ code: "23503" });
  }
 });
 it("[DW4b] self, chain, cycle, second active link and concurrent chain are refused", async () => {
  const f = await fixture(c), [a, b, d] = await extras(f), A = a!.variationId, B = b!.variationId, D = d!.variationId;
  await expect(rawLink(f, A, A)).rejects.toMatchObject({ code: "23514" });
  await repo.linkDuplicate(f.ctx, linkInput(f, A, B));
  for (const [x, y] of [[B, D], [B, A], [A, D], [D, A]]) await expect(rawLink(f, x!, y!)).rejects.toMatchObject({ code: "23514" });
  const g = await fixture(c), [e, h, i] = await extras(g);
  const results = await Promise.allSettled([repo.linkDuplicate(g.ctx, linkInput(g, e!.variationId, h!.variationId)), repo.linkDuplicate(g.ctx, linkInput(g, h!.variationId, i!.variationId))]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect((await c.admin.query("SELECT * FROM app.extra_duplicate_link WHERE tenant_id=$1", [g.p.tenantId])).rowCount).toBe(1);
 });
 it("[DW4b] immutable unlink row guards preserve history and allow relink before export; command surface HELD", async () => {
  const f = await fixture(c), [a, b] = await extras(f), A = a!.variationId, B = b!.variationId, first = await rawLink(f, A, B);
  await expect(rawLink(f, A, B, { kind: "unlink", reverses_link_id: first })).rejects.toMatchObject({ code: "23514" });
  await expect(rawLink(f, A, B, { kind: "unlink", reason_code: "duplicate_review" })).rejects.toMatchObject({ code: "23514" });
  const undo = await rawLink(f, A, B, { kind: "unlink", reverses_link_id: first, reason_code: "duplicate_review" });
  await expect(rawLink(f, A, B, { kind: "unlink", reverses_link_id: first, reason_code: "duplicate_review" })).rejects.toMatchObject({ code: "23505" });
  await rawLink(f, A, B); expect((await c.admin.query("SELECT id FROM app.extra_duplicate_link WHERE tenant_id=$1", [f.p.tenantId])).rows.map(r => r.id)).toEqual(expect.arrayContaining([first, undo]));
  for (const role of ["runtime", "owner"]) for (const sql of ["UPDATE app.extra_duplicate_link SET reason_code=reason_code", "DELETE FROM app.extra_duplicate_link"]) await expect(role === "runtime" ? withTenant(c.runtime, f.ctx, db => db.$client.query(sql)) : ownerTx(c, f.p.tenantId, db => db.$client.query(sql))).rejects.toMatchObject({ code: role === "runtime" ? "42501" : "55000" });
  await exported(f, A); await expect(rawLink(f, A, B)).rejects.toMatchObject({ message: "EXTRA_EXPORTED" }); await expect(rawLink(f, A, B, { kind: "unlink", reverses_link_id: first, reason_code: "duplicate_review" })).rejects.toMatchObject({ message: "EXTRA_EXPORTED" });
 });
 it("[DW4c] order-line links preserve origin/hash; same/older revision and duplicate use are refused", async () => {
  const f = await fixture(c), [a, b] = await extras(f), A = a!.variationId, old = (await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, A])).rows[0];
  const current = (await c.admin.query("SELECT * FROM app.work_order_line WHERE tenant_id=$1 AND revision_id=$2 LIMIT 1", [f.p.tenantId, f.revisionId])).rows[0];
  await expect(repo.linkOrderLine(f.ctx, orderInput(f, A, current))).rejects.toMatchObject({ code: "ORDER_LINE_LINK_REFUSED" });
  expect((await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, A])).rows[0]).toEqual(old);
  const line = await laterRevision(c, f); await repo.linkOrderLine(f.ctx, orderInput(f, A, line));
  for (const id of [b!.variationId]) { await expect(repo.linkOrderLine(f.ctx, orderInput(f, id, line))).rejects.toMatchObject({ code: "ORDER_LINE_LINK_REFUSED" }); expect((await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, A])).rows[0]).toEqual(old); }
  await expect(withTenant(c.runtime, f.ctx, async db => { await db.$client.query("UPDATE app.command_receipt SET status='processing',result=NULL,completed_at=NULL WHERE tenant_id=$1 AND command_id=(SELECT command_id FROM app.extra_order_line_link WHERE tenant_id=$1 AND variation_id=$2)", [f.p.tenantId, A]); await db.$client.query("INSERT INTO app.extra_order_line_link(tenant_id,id,job_id,variation_id,work_order_id,revision_id,scope_item_id,command_id,actor_membership_id) SELECT tenant_id,$2,job_id,variation_id,work_order_id,revision_id,scope_item_id,command_id,actor_membership_id FROM app.extra_order_line_link WHERE tenant_id=$1 AND variation_id=$3", [f.p.tenantId, randomUUID(), A]); })).rejects.toMatchObject({ code: "23505" });
  expect((await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, A])).rows[0]).toEqual(old);
  expect(extraOriginHashV1(originHashInput(old))).toBe(old.origin_hash);
 });
 it("[DW4b] either exported endpoint blocks link and unlink, preserving the origin", async () => {
  for (const endpoint of [0, 1]) {
   const f = await fixture(c), [a, b] = await extras(f), A = a!.variationId, B = b!.variationId, link = await rawLink(f, A, B);
   const before = (await c.admin.query(`${originSql} WHERE tenant_id=$1 ORDER BY variation_id`, [f.p.tenantId])).rows;
   await exported(f, endpoint === 0 ? A : B);
   await expect(rawLink(f, A, B)).rejects.toMatchObject({ message: "EXTRA_EXPORTED" });
   await expect(rawLink(f, A, B, { kind: "unlink", reverses_link_id: link, reason_code: "duplicate_review" })).rejects.toMatchObject({ message: "EXTRA_EXPORTED" });
   expect((await c.admin.query(`${originSql} WHERE tenant_id=$1 ORDER BY variation_id`, [f.p.tenantId])).rows).toEqual(before);
  }
 });
 it("[DW4c] an instructed revision older than the origin is refused", async () => {
  const f = await fixture(c), prior = (await c.admin.query("SELECT * FROM app.work_order_line WHERE tenant_id=$1 AND revision_id=$2 LIMIT 1", [f.p.tenantId, f.revisionId])).rows[0];
  await laterRevision(c, f); const a = await repo.raiseExtra(f.ctx, raise(f)), before = await repo.readExtra(f.ctx, f.jobId, a.variationId);
  await expect(repo.linkOrderLine(f.ctx, orderInput(f, a.variationId, prior))).rejects.toMatchObject({ code: "ORDER_LINE_LINK_REFUSED" }); expect(await repo.readExtra(f.ctx, f.jobId, a.variationId)).toEqual(before);
 });
 it("[DW5a] failed link/order seam and deferred missing audit roll back rows and receipts", async () => {
  const f = await fixture(c), [a, b] = await extras(f), input = linkInput(f, a!.variationId, b!.variationId);
  await expect(repo.linkDuplicate(f.ctx, input, async () => { throw new Error(noteCanary); })).rejects.toMatchObject({ message: "DATABASE_UNAVAILABLE" });
  await expect(rawLink(f, a!.variationId, b!.variationId, {}, false)).rejects.toMatchObject({ code: "23514" });
  const line = await laterRevision(c, f), order = orderInput(f, a!.variationId, line);
  await expect(repo.linkOrderLine(f.ctx, order, async () => { throw new Error(descriptionCanary); })).rejects.toMatchObject({ message: "DATABASE_UNAVAILABLE" });
  for (const table of ["extra_duplicate_link", "extra_order_line_link"]) expect((await c.admin.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId])).rowCount).toBe(0);
  for (const id of [input.commandId, order.commandId]) expect((await c.admin.query("SELECT * FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, id])).rowCount).toBe(0);
 });
 it("[DW5a] link, raw unlink and order writes roll back at receipt, fact, audit and commit failures", async () => {
  const f = await fixture(c), [a, b, d] = await extras(f), A = a!.variationId, B = b!.variationId, D = d!.variationId, first = await rawLink(f, A, B), line = await laterRevision(c, f);
  for (const kind of ["link", "unlink", "order"]) for (const fragment of ["INSERT INTO app.command_receipt", kind === "order" ? "INSERT INTO app.extra_order_line_link" : "INSERT INTO app.extra_duplicate_link", "FROM app.append_audit(", "COMMIT"]) {
   const before = Object.fromEntries(await Promise.all(["command_receipt", "extra_duplicate_link", "extra_order_line_link", "audit_event"].map(async table => [table, (await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId])).rows[0].n])));
   // Round 1: verify the chain and actual head before/after each injected rollback (NOT RUN).
   const headBefore = await verifiedHead(f);
   const originalConnect = c.runtime.connect.bind(c.runtime), connectSpy = vi.spyOn(c.runtime, "connect");
   connectSpy.mockImplementation((async () => { const client = await originalConnect(), query = client.query.bind(client); vi.spyOn(client, "query").mockImplementation((async (sql: any, params?: any) => { if (sql === "COMMIT" && fragment === "COMMIT") { await query("SET CONSTRAINTS ALL IMMEDIATE"); throw new Error(noteCanary); } const result = await query(sql, params); if (String(sql).includes(fragment)) throw new Error(noteCanary); return result; }) as any); return client; }) as any);
   try {
    const promise = kind === "link" ? repo.linkDuplicate(f.ctx, linkInput(f, D, B)) : kind === "unlink" ? rawLink(f, A, B, { kind: "unlink", reverses_link_id: first, reason_code: "duplicate_review" }) : repo.linkOrderLine(f.ctx, orderInput(f, D, line));
    await expect(promise).rejects.toBeDefined();
   } finally { vi.restoreAllMocks(); }
   for (const [table, count] of Object.entries(before)) expect((await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId])).rows[0].n, `${kind}:${fragment}:${table}`).toBe(count);
   expect(await verifiedHead(f), `${kind}:${fragment}:audit head`).toEqual(headBefore);
  }
 });
 it("[S4] missing unlink/order audit fails commit with no partial link history", async () => {
  const f = await fixture(c), [a, b] = await extras(f), link = await rawLink(f, a!.variationId, b!.variationId);
  await expect(rawLink(f, a!.variationId, b!.variationId, { kind: "unlink", reverses_link_id: link, reason_code: "duplicate_review" }, false)).rejects.toMatchObject({ code: "23514" });
  const line = await laterRevision(c, f);
  await expect(withTenant(c.runtime, f.ctx, async db => { const command = await receipt(db, f.p.tenantId, f.jobId, a!.variationId, f.p.membershipId, "RecordClientInstruction", randomUUID(), { semanticKey: `extra-order-line:${f.jobId}:${a!.variationId}` }); await db.$client.query("INSERT INTO app.extra_order_line_link(tenant_id,id,job_id,variation_id,work_order_id,revision_id,scope_item_id,command_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [f.p.tenantId, randomUUID(), f.jobId, a!.variationId, line.work_order_id, line.revision_id, line.scope_item_id, command, f.p.membershipId]); })).rejects.toMatchObject({ code: "23514" });
  expect((await c.admin.query("SELECT kind FROM app.extra_duplicate_link WHERE tenant_id=$1", [f.p.tenantId])).rows).toEqual([{ kind: "link" }]); expect((await c.admin.query("SELECT * FROM app.extra_order_line_link WHERE tenant_id=$1", [f.p.tenantId])).rowCount).toBe(0);
 });
 it("[DW6] link audits contain only allowed IDs and hashes", async () => {
  const f = await fixture(c), [a, b] = await extras(f); await repo.linkDuplicate(f.ctx, linkInput(f, a!.variationId, b!.variationId)); await repo.linkOrderLine(f.ctx, orderInput(f, a!.variationId, await laterRevision(c, f)));
  const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 AND event_type IN('contractor.extra.duplicate_linked','contractor.extra.order_line_linked')", [f.p.tenantId])).rows;
  expect(rows).toHaveLength(2); for (const row of rows) { expect(auditPayloadV1Schema.safeParse(row.payload).success).toBe(true); for (const [key, value] of Object.entries(row.payload.references)) { expect(["auditTrust", "command", "job", "extra", "duplicate", "canonical", "link", "work_order", "revision", "scope", "environment"]).toContain(key); if (key === "auditTrust") expect(value).toBe("lower_trust"); else expect(value).toMatch(/^(?:[a-f0-9-]{36}|synthetic_demo)$/u); } expect(JSON.stringify(row)).not.toContain(noteCanary); expect(JSON.stringify(row)).not.toContain(descriptionCanary); }
 });
 it("[R2] effective origin is independent of canonical choice and uses lower ID on a time tie", async () => {
  for (const reverse of [false, true]) {
   const f = await fixture(c), a = await repo.raiseExtra(f.ctx, raise(f)), b = await repo.raiseExtra(f.ctx, raise(f, { commandType: "RecordOfficeExtra" }));
   await repo.linkDuplicate(f.ctx, linkInput(f, reverse ? a.variationId : b.variationId, reverse ? b.variationId : a.variationId));
   const group = await repo.readDuplicateGroup(f.ctx, f.jobId, a.variationId); expect(group.effectiveOrigin.origin.variationId).toBe(a.variationId); expect(group.members).toHaveLength(2);
  }
  // Two raises in one transaction share transaction_timestamp(), proving tie by ID without editing origins.
  const f = await fixture(c), ids = [randomUUID(), randomUUID()].sort();
  await withTenant(c.runtime, f.ctx, async db => { const events = []; for (const [i, id] of ids.entries()) { const type = i === 0 ? "LogSiteExtra" : "RecordOfficeExtra", kind = i === 0 ? "site_user" : "office_entry", command = await receipt(db, f.p.tenantId, f.jobId, id!, f.p.membershipId, type); await rawVariation(db, f.p.tenantId, f.jobId, id, kind); const row = await rawOrigin(db, f, id!, command, { kind }); await db.$client.query("INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id) VALUES($1,$2,$3,$4,'logged',$5,$6)", [f.p.tenantId, randomUUID(), f.jobId, id, command, f.p.membershipId]); events.push({ id: randomUUID(), version: "audit.v1" as const, actorRef: `membership:${f.p.membershipId}`, eventType: "contractor.extra.raised", subjectType: "extra", subjectRef: id!, payload: { references: { command }, hashes: { origin: row.origin_hash } } }); } await appendAuditBatch(db, events); });
  await repo.linkDuplicate(f.ctx, linkInput(f, ids[0]!, ids[1]!)); expect((await repo.readDuplicateGroup(f.ctx, f.jobId, ids[1]!)).effectiveOrigin.origin.variationId).toBe(ids[0]);
 });
 it("[R3] later formal instruction leaves one extra and its immutable site origin intact", async () => {
  const f = await fixture(c), a = await repo.raiseExtra(f.ctx, raise(f)), before = await repo.readExtra(f.ctx, f.jobId, a.variationId); await repo.linkOrderLine(f.ctx, orderInput(f, a.variationId, await laterRevision(c, f)));
  expect(await repo.readExtra(f.ctx, f.jobId, a.variationId)).toEqual(before);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.variation WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId, f.jobId])).rows[0].n).toBe(1);
 });
 it("[S1] foreign tenant link/event reads are NOT_FOUND; writes cannot name foreign extras", async () => {
  const f = await fixture(c), g = await fixture(c), [a, b] = await extras(f); await repo.linkDuplicate(f.ctx, linkInput(f, a!.variationId, b!.variationId));
  await expect(repo.readDuplicateGroup(g.ctx, f.jobId, a!.variationId)).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(repo.linkDuplicate(g.ctx, linkInput(f, a!.variationId, b!.variationId))).rejects.toMatchObject({ code: "NOT_FOUND" });
  await withTenant(c.runtime, g.ctx, async db => { for (const table of ["extra_event", "extra_duplicate_link", "extra_order_line_link"]) expect((await db.$client.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`, [f.p.tenantId])).rows).toEqual([]); });
 });
 it("[S4] both link tables and unlink history share xmin with their audit; missing audit fails commit", async () => {
  const f = await fixture(c), [a, b] = await extras(f), id = await rawLink(f, a!.variationId, b!.variationId); await rawLink(f, a!.variationId, b!.variationId, { kind: "unlink", reverses_link_id: id, reason_code: "duplicate_review" }); await repo.linkOrderLine(f.ctx, orderInput(f, a!.variationId, await laterRevision(c, f)));
  for (const table of ["extra_duplicate_link", "extra_order_line_link"]) { const rows = (await c.admin.query(`SELECT l.xmin::text l,a.xmin::text a FROM app.${table} l JOIN app.audit_event a ON (a.tenant_id,a.id)=(l.tenant_id,l.id) WHERE l.tenant_id=$1`, [f.p.tenantId])).rows; expect(rows.length).toBeGreaterThan(0); for (const row of rows) expect(row.l).toBe(row.a); }
 });
});
