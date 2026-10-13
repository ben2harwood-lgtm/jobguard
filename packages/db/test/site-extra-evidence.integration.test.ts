// ENT-3d governed path: a verified photo and a server-written resident confirmation on a logged site extra (log-site-extra.v3).
// Written before the repository code. The migration SQL was drafted before these tests; the repository was not.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extraOriginHashV1, SiteExtraError, siteExtraFailureV1, siteExtraHttpStatus, residentConfirmationContentType, residentConfirmationObjectVersion, siteExtraContentSha256V1, residentConfirmationDocumentV1 } from "@jobguard/core";
import { SiteExtraRepository, siteExtraAuthoritySeam, WatchdogError, ExtraRepository, withTenant } from "../src/index.js";
import {
 cluster, siteFixture, chain, direct, invite, ownerTx, originSql, originHashInput, note, description,
 photo, pendingPhoto, rejectedPhoto, rawObjectOverPending, previewOf, invalidate, v3, shownFor, confirmationIdFor, documentFor, sha,

 evidenceCounts, evidenceRowsText, refusalEvents, runtimeCall, type Cluster, type SiteFixture,
} from "./site-extra-evidence-fixtures.js";
import { fixture } from "./extra-fixtures.js";
let c: Cluster, repo: SiteExtraRepository;
beforeAll(async () => { c = await cluster(); repo = new SiteExtraRepository(c.runtime); }, 90_000);
afterAll(async () => { await c?.close(); });
const where = (f: SiteFixture) => ({ ctx: f.ctx, jobId: f.jobId });
const errorOf = (work: Promise<unknown>) => work.then(() => { throw new Error("unexpected success"); }, e => e as Error);
/** A refusal: the typed error, nothing written (no row of any table, no evidence), the audit chain intact. */
async function refused(f: SiteFixture, member: SiteFixture["p"], raw: Record<string, unknown>, code: string, expectedRefusalReason?: string) {
 const before = await evidenceCounts(c, f), rows = await evidenceRowsText(c, f);
 const error = await errorOf(repo.logSiteExtra(f.ctx, member, raw)) as SiteExtraError;
 expect(error).toBeInstanceOf(SiteExtraError); expect(error.code).toBe(code); expect(error.message).toBe(code);
 expect(JSON.stringify(error)).not.toContain(note); expect(JSON.stringify(error)).not.toContain(description);
 expect(await evidenceCounts(c, f)).toEqual(before); expect(await evidenceRowsText(c, f)).toEqual(rows); await chain(c, f);
 if (expectedRefusalReason) expect(await refusalEvents(c, f, raw.commandId as string)).toEqual([expectedRefusalReason]);
 return error;
}
const originOf = async (f: SiteFixture, extra: string) => (await c.admin.query(`${originSql} WHERE tenant_id=$1 AND variation_id=$2`, [f.p.tenantId, extra])).rows[0]!;

describe("ENT-3d verified photo and resident confirmation", () => {
 it("[E7] a verified photo is accepted: the origin links it, copies its hash and covers it in the origin hash", async () => {
  const f = await siteFixture(c), a = f.members.supervisor, p = await photo(c, where(f)), raw = v3(f, { photoEvidenceId: p.id });
  const result = await repo.logSiteExtra(f.ctx, a.member, raw);
  const row = await originOf(f, result.variationId);
  expect(row).toMatchObject({ job_id: f.jobId, evidence_id: p.id, resident_confirmation_evidence_id: null, kind: "site_user", command_type: "LogSiteExtra" });
  expect(row.evidence_hash.trim()).toBe(p.sha256); expect(row.origin_hash).toBe(extraOriginHashV1(originHashInput(row)));
  expect(result.evidence).toEqual({ photoEvidenceId: p.id, residentConfirmationEvidenceId: null, contentSha256: shownFor(f, p.sha256) });
  expect((await c.admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.raised'", [f.p.tenantId, result.variationId])).rowCount).toBe(1);
  expect((await evidenceCounts(c, f)).recorded).toBe(0); await chain(c, f);
 });
 const causes: Array<[string, (f: SiteFixture) => Promise<string>]> = [
  ["a pending upload", async f => (await pendingPhoto(c, where(f))).id],
  ["a rejected upload", async f => (await rejectedPhoto(c, where(f))).id],
  ["a raw object row over a pending upload", async f => (await rawObjectOverPending(c, f, where(f))).id],
  ["a verified photo of another job of the same company", async f => (await photo(c, { ctx: f.ctx, jobId: f.otherJob })).id],
  ["a verified photo of another company", async () => { const other = await fixture(c); return (await photo(c, { ctx: other.ctx, jobId: other.jobId })).id; }],
  ["a verified object of another type", async f => (await photo(c, where(f), { type: "completion_photo" })).id],
  ["a preview", async f => previewOf(c, where(f), await photo(c, where(f)))],
  ["an invalidated photo", async f => { const p = await photo(c, where(f)); await invalidate(c, f, p.id); return p.id; }],
  ["an unknown id", async () => randomUUID()],
  ["a confirmation document's id used as the photo", async f => { const id = randomUUID(), out = await repo.logSiteExtra(f.ctx, f.members.supervisor.member, v3(f, { commandId: id, shownContentSha256: shownFor(f, null) })); expect(out.evidence?.residentConfirmationEvidenceId).toBe(confirmationIdFor(f, id)); return confirmationIdFor(f, id); }],
 ];
 // Loops every refusal cause against a real database, which can exceed the default timeout in CI.
 it("[E8] every cause of a photo that is not accepted gives the identical PHOTO_NOT_ACCEPTED, nothing written, one refusal event", async () => {
  const errors: Error[] = [];
  for (const [cause, make] of causes) {
   const f = await siteFixture(c), id = await make(f), raw = v3(f, { photoEvidenceId: id });
   const error = await refused(f, f.members.supervisor.member, raw, "PHOTO_NOT_ACCEPTED", "photo_not_accepted");
   expect({ cause, status: siteExtraHttpStatus((error as SiteExtraError).code), body: siteExtraFailureV1.parse({ version: "site-extra-error.v1", code: (error as SiteExtraError).code }) }).toEqual({ cause, status: 422, body: { version: "site-extra-error.v1", code: "PHOTO_NOT_ACCEPTED" } });
   errors.push(error);
   // A retry of the same refused command adds no second refusal event.
   await errorOf(repo.logSiteExtra(f.ctx, f.members.supervisor.member, raw)); expect(await refusalEvents(c, f, raw.commandId)).toEqual(["photo_not_accepted"]);
  }
  for (const error of errors) expect(error).toEqual(errors[0]);
 }, 60_000);
 it("[E9] the guard alone: merged raiseExtra with the seam and an unverified photo is rejected, nothing written", async () => {
  const f = await siteFixture(c), raw = await rawObjectOverPending(c, f, where(f)), before = await evidenceCounts(c, f), head = await chain(c, f);
  await expect(new ExtraRepository(c.runtime).raiseExtra(f.ctx, direct(f, f.members.supervisor, { evidenceId: raw.id }), siteExtraAuthoritySeam)).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  expect(await evidenceCounts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
  // Without the seam the merged trigger alone accepts it (limit L1): the check binds the governed path.
  await new ExtraRepository(c.runtime).raiseExtra(f.ctx, direct(f, f.members.supervisor, { evidenceId: raw.id }));
 });
 it("[E10] a missing, empty or whitespace-only note is INVALID_COMMAND with a verified photo and without one; nothing written", async () => {
  const f = await siteFixture(c), p = await photo(c, where(f)), before = await evidenceCounts(c, f);
  for (const bad of [undefined, "", " \t\n"]) for (const extra of [{}, { photoEvidenceId: p.id }, { photoEvidenceId: p.id, shownContentSha256: shownFor(f, p.sha256) }]) {
   const raw: Record<string, unknown> = { ...v3(f, extra), note: bad }; if (bad === undefined) delete raw.note;
   const error = await errorOf(repo.logSiteExtra(f.ctx, f.members.supervisor.member, raw)) as SiteExtraError; expect(error.code).toBe("INVALID_COMMAND");
  }
  expect(await evidenceCounts(c, f)).toEqual(before);
 });
 for (const withPhoto of [true, false]) it(`[E11] a confirmation is recorded ${withPhoto ? "with" : "without"} a photo: one document, its rows exactly as defined, linked and covered by the origin hash`, async () => {
  const f = await siteFixture(c), a = f.members.supervisor, p = withPhoto ? await photo(c, where(f)) : undefined;
  const commandId = randomUUID(), content = shownFor(f, p?.sha256 ?? null), before = await evidenceCounts(c, f);
  const result = await repo.logSiteExtra(f.ctx, a.member, v3(f, { commandId, ...(p ? { photoEvidenceId: p.id } : {}), shownContentSha256: content }));
  const confirmation = confirmationIdFor(f, commandId), text = documentFor(f, confirmation, content), documentHash = sha(text);
  expect(result.evidence).toEqual({ photoEvidenceId: p?.id ?? null, residentConfirmationEvidenceId: confirmation, contentSha256: content });
  const after = await evidenceCounts(c, f); expect(after.evidence_upload).toBe(before.evidence_upload! + 1); expect(after.evidence_object).toBe(before.evidence_object! + 1); expect(after.recorded).toBe(1);
  const object = (await c.admin.query("SELECT *,server_received_at::text received,server_verified_at::text verified FROM app.evidence_object WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, confirmation])).rows[0]!;
  const upload = (await c.admin.query("SELECT *,server_received_at::text received,server_verified_at::text verified,expires_at::text expires FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, confirmation])).rows[0]!;
  const key = `tenants/${f.p.tenantId}/resident-confirmations/${confirmation}/document`;
  expect(object).toMatchObject({ id: confirmation, upload_id: confirmation, job_id: f.jobId, scope_item_id: null, kind: "original", original_evidence_id: null, evidence_type: "resident_confirmation", object_key: key, object_version_id: residentConfirmationObjectVersion, byte_length: String(Buffer.byteLength(text, "utf8")), content_type: residentConfirmationContentType, retention_class: "standard_evidence", device_captured_at: null });
  expect(object.sha256.trim()).toBe(documentHash);
  expect(upload).toMatchObject({ id: confirmation, job_id: f.jobId, scope_item_id: null, object_key: key, maximum_bytes: object.byte_length, expected_content_type: residentConfirmationContentType, retention_class: "standard_evidence", state: "verified", rejection_code: null, object_version_id: residentConfirmationObjectVersion, device_captured_at: null });
  expect(upload.expected_sha256.trim()).toBe(documentHash);
  expect(new Set([object.received, object.verified, upload.received, upload.verified, upload.expires]).size).toBe(1);
  const row = await originOf(f, result.variationId);
  expect(row).toMatchObject({ evidence_id: p?.id ?? null, resident_confirmation_evidence_id: confirmation }); expect(row.origin_hash).toBe(extraOriginHashV1(originHashInput(row)));
  const events = (await c.admin.query("SELECT payload,actor_ref,subject_type,subject_ref FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.resident_confirmation_recorded'", [f.p.tenantId])).rows;
  expect(events).toEqual([{ actor_ref: `membership:${a.member.membershipId}`, subject_type: "evidence", subject_ref: confirmation, payload: { references: { command: commandId, job: f.jobId, confirmation, environment: "synthetic_demo" }, hashes: { content, document: documentHash } } }]);
  const payloads = (await c.admin.query("SELECT payload::text body FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows.map(r => r.body as string).join("\n");
  expect(payloads).not.toContain(note); expect(payloads).not.toContain(description); await chain(c, f);
 });
 it("[E26] the stored confirmation document rebuilds from persisted facts: bytes, hash and length", async () => {
  const f = await siteFixture(c), p = await photo(c, where(f));
  const result = await repo.logSiteExtra(f.ctx, f.members.supervisor.member, v3(f, { photoEvidenceId: p.id, shownContentSha256: shownFor(f, p.sha256) }));
  const stored = await c.admin.query<{
   tenant_id: string; job_id: string; confirmation_id: string; description: string; capture_text: string; evidence_hash: string;
   document_sha256: string; byte_length: string; recorded_content_sha256: string; recorded_document_sha256: string; recorded_document_bytes: Buffer;
  }>(`SELECT v.tenant_id::text,v.job_id::text,e.id::text confirmation_id,v.description,v.capture_text,o.evidence_hash::text,
    e.sha256::text document_sha256,e.byte_length::text,a.payload->'hashes'->>'content' recorded_content_sha256,
    a.payload->'hashes'->>'document' recorded_document_sha256,
    convert_to(app.ent3d_confirmation_document(a.tenant_id,(a.payload->'references'->>'job')::uuid,
      (a.payload->'references'->>'confirmation')::uuid,a.payload->'hashes'->>'content'),'UTF8') recorded_document_bytes
   FROM app.variation v
   JOIN app.extra_origin o ON (o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id)
   JOIN app.evidence_object e ON (e.tenant_id,e.job_id,e.id)=(o.tenant_id,o.job_id,o.resident_confirmation_evidence_id)
   JOIN app.audit_event a ON a.tenant_id=e.tenant_id AND a.subject_ref=e.id::text
    AND a.event_type='contractor.extra.resident_confirmation_recorded'
   WHERE v.tenant_id=$1 AND v.id=$2`, [f.p.tenantId, result.variationId]);
  expect(stored.rows).toHaveLength(1);
  const facts = stored.rows[0]!;
  const contentSha256 = siteExtraContentSha256V1({ jobId: facts.job_id, description: facts.description, note: facts.capture_text, photoSha256: facts.evidence_hash });
  const rebuilt = residentConfirmationDocumentV1({ tenantId: facts.tenant_id, jobId: facts.job_id, confirmationId: facts.confirmation_id, contentSha256 });
  const rebuiltBytes = Buffer.from(rebuilt, "utf8");
  const rebuiltSha256 = createHash("sha256").update(rebuiltBytes).digest("hex");
  // Contract L6: bytes are reconstructed, not persisted; the independent SQL reconstruction uses the persisted confirmation event.
  expect(contentSha256).toBe(facts.recorded_content_sha256);
  expect(rebuiltBytes).toEqual(facts.recorded_document_bytes);
  expect(rebuiltSha256).toBe(facts.document_sha256);
  expect(rebuiltSha256).toBe(facts.recorded_document_sha256);
  expect(String(rebuiltBytes.byteLength)).toBe(facts.byte_length);
 });
 it("[E12] a hash shown for different content is CONFIRMATION_MISMATCH each time; nothing written, no evidence row either, one refusal event", async () => {
  const f = await siteFixture(c), p = await photo(c, where(f)), other = await photo(c, where(f)), a = f.members.supervisor.member;
  const shown = [shownFor(f, p.sha256, { description: "Fictional other description" }), shownFor(f, p.sha256, { note: "Fictional other note" }), shownFor(f, other.sha256), shownFor(f, null), shownFor(f, p.sha256, { jobId: f.otherJob })];
  for (const shownContentSha256 of shown) await refused(f, a, v3(f, { photoEvidenceId: p.id, shownContentSha256 }), "CONFIRMATION_MISMATCH", "confirmation_mismatch");
  const error = await refused(f, a, v3(f, { shownContentSha256: shownFor(f, p.sha256) }), "CONFIRMATION_MISMATCH", "confirmation_mismatch");
  expect(siteExtraHttpStatus((error as SiteExtraError).code)).toBe(422);
 });
 it("[E13] the guard alone, binding: a document written for content X cannot serve content Y, serves X once, and not a second extra", async () => {
  const f = await siteFixture(c), a = f.members.supervisor, extras = new ExtraRepository(c.runtime), confirmation = randomUUID();
  const record = (fields: Record<string, unknown>) => runtimeCall(c, f, async q => (await q("SELECT outcome,reason_code FROM app.ent3d_record_resident_confirmation($1,$2,$3,$4,$5,$6,$7,$8)", [a.member.membershipId, f.jobId, randomUUID(), confirmation, fields.description, fields.note, null, fields.shown])).rows[0]);
  expect(await record({ description, note, shown: shownFor(f, null) })).toEqual({ outcome: "recorded", reason_code: "recorded" });
  const before = await evidenceCounts(c, f), head = await chain(c, f);
  await expect(extras.raiseExtra(f.ctx, direct(f, a, { residentConfirmationEvidenceId: confirmation, note: "Fictional content Y" }), siteExtraAuthoritySeam)).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  expect(await evidenceCounts(c, f)).toEqual(before); expect(await chain(c, f)).toBe(head);
  await extras.raiseExtra(f.ctx, direct(f, a, { residentConfirmationEvidenceId: confirmation }), siteExtraAuthoritySeam);
  await expect(extras.raiseExtra(f.ctx, direct(f, a, { residentConfirmationEvidenceId: confirmation }), siteExtraAuthoritySeam)).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  expect((await evidenceCounts(c, f)).raised).toBe(before.raised! + 1);
 });
 it("[E14] a confirmation whose content the client tried to supply is rejected at the database; routine 4 has no content argument", async () => {
  const f = await siteFixture(c), a = f.members.supervisor, extras = new ExtraRepository(c.runtime);
  // (a) an uploaded image typed resident_confirmation
  const image = await photo(c, where(f), { type: "resident_confirmation" });
  await expect(extras.raiseExtra(f.ctx, direct(f, a, { residentConfirmationEvidenceId: image.id }), siteExtraAuthoritySeam)).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  // (b) a raw runtime-role row typed resident_confirmation whose hash is not the server's document for this content
  const raw = randomUUID(), key = `tenants/${f.p.tenantId}/resident-confirmations/${raw}/document`, wrong = sha("not the server's document");
  await runtimeCall(c, f, async q => {
   await q("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,10,'standard_evidence','verified',$7,clock_timestamp(),clock_timestamp())", [raw, f.p.tenantId, f.jobId, key, wrong, residentConfirmationContentType, residentConfirmationObjectVersion]);
   await q("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$1,$3,'original','resident_confirmation',$4,$5,$6,10,$7,'standard_evidence',clock_timestamp(),clock_timestamp())", [raw, f.p.tenantId, f.jobId, key, residentConfirmationObjectVersion, wrong, residentConfirmationContentType]);
  });
  const before = await evidenceCounts(c, f);
  await expect(extras.raiseExtra(f.ctx, direct(f, a, { residentConfirmationEvidenceId: raw }), siteExtraAuthoritySeam)).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  expect(await evidenceCounts(c, f)).toEqual(before);
  // (c) the catalogue
  const proc = (await c.admin.query("SELECT pg_get_function_identity_arguments(p.oid) args FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname='ent3d_record_resident_confirmation'")).rows;
  expect(proc).toEqual([{ args: "p_actor uuid, p_job uuid, p_command uuid, p_confirmation uuid, p_description text, p_note text, p_photo uuid, p_shown_content_sha256 text" }]);
  for (const forbidden of [/document/u, /type/u, /key/u, /label/u, /time/u, /statement/u, /version/u]) expect(proc[0]!.args).not.toMatch(forbidden);
 });
 it("[E15] the same command and payload twice, and twice at once, have one effect and equal answers; changed payloads conflict", async () => {
  const f = await siteFixture(c), a = f.members.supervisor.member, p = await photo(c, where(f)), raw = v3(f, { photoEvidenceId: p.id, shownContentSha256: shownFor(f, p.sha256) });
  const before = await evidenceCounts(c, f);
  const [one, two] = await Promise.all([repo.logSiteExtra(f.ctx, a, raw), repo.logSiteExtra(f.ctx, a, raw)]);
  expect(one).toEqual(two); const after = await evidenceCounts(c, f);
  expect(after).toMatchObject({ raised: before.raised! + 1, extra_origin: before.extra_origin! + 1, variation: before.variation! + 1, evidence_object: before.evidence_object! + 1, evidence_upload: before.evidence_upload! + 1, recorded: 1 });
  expect(await repo.logSiteExtra(f.ctx, a, raw)).toEqual(one); expect(await evidenceCounts(c, f)).toEqual(after);
  const other = await photo(c, where(f));
  const changes: Array<[string, Record<string, unknown>]> = [
   ["a different note", { note: "Fictional different note", shownContentSha256: raw.shownContentSha256 }], ["a different description", { description: "Fictional different description" }],
   ["a different photo", { photoEvidenceId: other.id }], ["a different hash shown", { shownContentSha256: shownFor(f, p.sha256, { note: "Fictional different note" }) }],
   ["the photo removed", { photoEvidenceId: undefined }], ["the confirmation removed", { shownContentSha256: undefined }], ["both removed", { photoEvidenceId: undefined, shownContentSha256: undefined }],
  ];
  for (const [name, change] of changes) { const changed = { ...raw, ...change } as Record<string, unknown>; const error = await errorOf(repo.logSiteExtra(f.ctx, a, changed)) as SiteExtraError; expect({ name, code: error.code }).toEqual({ name, code: "COMMAND_CONFLICT" }); }
  // Evidence added to a command that first had none.
  const plain = v3(f), first = await repo.logSiteExtra(f.ctx, a, plain); expect(first.variationId).toBeTruthy();
  const mid = await evidenceCounts(c, f);
  for (const added of [{ photoEvidenceId: other.id }, { shownContentSha256: shownFor(f, null) }, { photoEvidenceId: other.id, shownContentSha256: shownFor(f, other.sha256) }]) expect(((await errorOf(repo.logSiteExtra(f.ctx, a, { ...plain, ...added }))) as SiteExtraError).code).toBe("COMMAND_CONFLICT");
  expect(await evidenceCounts(c, f)).toEqual(mid); expect(await evidenceCounts(c, f)).toMatchObject({ recorded: 1 });
  await chain(c, f);
 });
 it("[E16] tenant isolation: another company cannot see or use a photo or a document; an upper-case tenant setting still works; line 2 is the row's own tenant", async () => {
  const a = await siteFixture(c), b = await siteFixture(c), p = await photo(c, where(a)), raw = v3(a, { photoEvidenceId: p.id, shownContentSha256: shownFor(a, p.sha256) });
  const logged = await repo.logSiteExtra(a.ctx, a.members.supervisor.member, raw); const confirmation = logged.evidence!.residentConfirmationEvidenceId!;
  for (const id of [p.id, confirmation]) for (const table of ["evidence_object", "evidence_upload"]) expect((await withTenant(c.runtime, b.ctx, db => db.$client.query(`SELECT 1 FROM app.${table} WHERE id=$1`, [id]))).rowCount).toBe(0);
  const error = await errorOf(repo.logSiteExtra(b.ctx, b.members.supervisor.member, v3(b, { photoEvidenceId: p.id }))) as SiteExtraError; expect(error.code).toBe("PHOTO_NOT_ACCEPTED");
  await expect(new ExtraRepository(c.runtime).raiseExtra(b.ctx, direct(b, b.members.supervisor, { residentConfirmationEvidenceId: confirmation }), siteExtraAuthoritySeam)).rejects.toBeTruthy();
  const upper = await runtimeCall(c, a, async q => { await q("SELECT set_config('app.tenant_id',$1,true)", [a.p.tenantId.toUpperCase()]); return (await q("SELECT decision FROM app.ent3d_site_extra_evidence($1,$2,$3,$4,NULL,NULL)", [a.jobId, note, description, p.id])).rows; });
  expect(upper).toEqual([{ decision: "accepted" }]);
  for (const row of (await c.admin.query("SELECT tenant_id,sha256,id,job_id FROM app.evidence_object WHERE evidence_type='resident_confirmation'")).rows) {
   const rebuilt = (await c.admin.query("SELECT app.ent3d_confirmation_document($1,$2,$3,$4) text", [row.tenant_id, row.job_id, row.id, "a".repeat(64)])).rows[0]!.text as string;
   expect(rebuilt.split("\n")[1]).toBe(`tenant:${row.tenant_id}`);
  }
 });
 it("[E17] every role that may not log gets ENT-3a's EXTRA_FORBIDDEN for a v3 command; not-named and out-of-scope members get NOT_FOUND, identical with a real or unknown photo", async () => {
  const f = await siteFixture(c), real = await photo(c, where(f));
  for (const role of ["owner", "admin", "commercial_manager", "finance", "read_only", "client_approver"] as const) {
   const errors = [];
   for (const photoEvidenceId of [real.id, randomUUID()]) errors.push(await refused(f, f.members[role].member, v3(f, { photoEvidenceId, shownContentSha256: shownFor(f, real.sha256) }), "EXTRA_FORBIDDEN"));
   expect(errors[1]).toEqual(errors[0]);
  }
  const notFound = [];
  for (const member of [f.unassigned.member, f.otherSupervisor.member, f.otherSurveyor.member]) for (const photoEvidenceId of [real.id, randomUUID()]) notFound.push(await refused(f, member, v3(f, { photoEvidenceId }), "NOT_FOUND"));
  for (const error of notFound) expect(error).toEqual(notFound[0]);
 });
 it("[E18] existing evidence rows are byte-identical after a successful v3 command and after a refused one", async () => {
  const f = await siteFixture(c), p = await photo(c, where(f)), unrelated = await photo(c, where(f)), before = await evidenceRowsText(c, f);
  expect(Object.keys(before).length).toBeGreaterThanOrEqual(4);
  await repo.logSiteExtra(f.ctx, f.members.supervisor.member, v3(f, { photoEvidenceId: p.id, shownContentSha256: shownFor(f, p.sha256) }));
  await errorOf(repo.logSiteExtra(f.ctx, f.members.supervisor.member, v3(f, { photoEvidenceId: unrelated.id, shownContentSha256: "0".repeat(64) })));
  await errorOf(repo.logSiteExtra(f.ctx, f.members.supervisor.member, v3(f, { photoEvidenceId: randomUUID() })));
  const after = await evidenceRowsText(c, f);
  for (const [key, text] of Object.entries(before)) expect(after[key], key).toBe(text);
  expect(Object.keys(after).length).toBe(Object.keys(before).length + 2);
 });
 it("[E19] the resident's contact values appear in no document, evidence row, audit payload or thrown error", async () => {
  const f = await siteFixture(c), p = await photo(c, where(f));
  const contact = (await c.admin.query("SELECT contact FROM app.contractor_resident_contact WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId, f.jobId])).rows[0]!.contact as Record<string, unknown>;
  const values = Object.entries(contact).filter(([k, v]) => k !== "version" && typeof v === "string").map(([, v]) => v as string); expect(values.length).toBeGreaterThanOrEqual(3);
  const result = await repo.logSiteExtra(f.ctx, f.members.supervisor.member, v3(f, { photoEvidenceId: p.id, shownContentSha256: shownFor(f, p.sha256) }));
  const error = await errorOf(repo.logSiteExtra(f.ctx, f.members.supervisor.member, v3(f, { photoEvidenceId: randomUUID(), shownContentSha256: "0".repeat(64) })));
  const confirmation = result.evidence!.residentConfirmationEvidenceId!;
  const text = JSON.stringify([
   documentFor(f, confirmation, result.evidence!.contentSha256),
   (await c.admin.query("SELECT to_jsonb(t) FROM app.evidence_object t WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, confirmation])).rows, (await c.admin.query("SELECT to_jsonb(t) FROM app.evidence_upload t WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, confirmation])).rows,
   (await c.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows, String(error.message), JSON.stringify(error),
  ]);
  for (const value of values) expect(text).not.toContain(value);
 });
});

// The named replay, conflict, no-op, not-live and authority-first properties of a v3 command (build standard F).
describe("ENT-3d v3 command replay properties", () => {
 it("replaying a command id returns the first result, never the job's current state", async () => {
  const f = await siteFixture(c), a = f.members.supervisor.member, p = await photo(c, where(f)), raw = v3(f, { photoEvidenceId: p.id, shownContentSha256: shownFor(f, p.sha256) });
  const first = await repo.logSiteExtra(f.ctx, a, raw), after = await evidenceCounts(c, f);
  // The job moves on: the photo is invalidated, so a NEW command naming it is refused now.
  await invalidate(c, f, p.id);
  expect(((await errorOf(repo.logSiteExtra(f.ctx, a, v3(f, { photoEvidenceId: p.id })))) as SiteExtraError).code).toBe("PHOTO_NOT_ACCEPTED");
  const settled = await evidenceCounts(c, f), rows = await evidenceRowsText(c, f);
  const replay = await repo.logSiteExtra(f.ctx, a, raw);
  expect(replay).toEqual(first); expect(await evidenceCounts(c, f)).toEqual(settled); expect(await evidenceRowsText(c, f)).toEqual(rows);
  expect(settled.evidence_object).toBe(after.evidence_object); expect(settled.recorded).toBe(1);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.evidence_object WHERE tenant_id=$1 AND evidence_type='resident_confirmation'", [f.p.tenantId])).rows[0]!.n).toBe(1);
 });
 it("the same command id with a changed payload conflicts", async () => {
  const f = await siteFixture(c), a = f.members.supervisor.member, p = await photo(c, where(f)), q = await photo(c, where(f)), raw = v3(f, { photoEvidenceId: p.id, shownContentSha256: shownFor(f, p.sha256) });
  await repo.logSiteExtra(f.ctx, a, raw); const before = await evidenceCounts(c, f), rows = await evidenceRowsText(c, f);
  for (const change of [{ photoEvidenceId: q.id }, { shownContentSha256: shownFor(f, p.sha256, { note: "Fictional changed note" }) }, { note: "Fictional changed note" }, { description: "Fictional changed description" }]) {
   expect(((await errorOf(repo.logSiteExtra(f.ctx, a, { ...raw, ...change }))) as SiteExtraError).code).toBe("COMMAND_CONFLICT");
   expect(await evidenceCounts(c, f)).toEqual(before); expect(await evidenceRowsText(c, f)).toEqual(rows);
  }
 });
 it("the same command id on another job conflicts", async () => {
  const f = await siteFixture(c), wide = await invite(c, f, "supervisor", { kind: "tenant", id: f.p.tenantId }), a = wide.member;
  const here = await photo(c, where(f)), there = await photo(c, { ctx: f.ctx, jobId: f.otherJob });
  const first = v3(f, { photoEvidenceId: here.id, shownContentSha256: shownFor(f, here.sha256) }); await repo.logSiteExtra(f.ctx, a, first);
  const before = await evidenceCounts(c, f), rows = await evidenceRowsText(c, f);
  for (const second of [{ jobId: f.otherJob, photoEvidenceId: there.id, shownContentSha256: shownFor(f, there.sha256, { jobId: f.otherJob }) }, { jobId: f.otherJob, photoEvidenceId: there.id, shownContentSha256: undefined }]) {
   expect(((await errorOf(repo.logSiteExtra(f.ctx, a, { ...first, ...second }))) as SiteExtraError).code).toBe("COMMAND_CONFLICT");
   expect(await evidenceCounts(c, f)).toEqual(before); expect(await evidenceRowsText(c, f)).toEqual(rows);
  }
 });
 it("a successful no-op keeps its identity", async () => {
  // The first successful call is not a no-op. The property applies to the replay: the same id and body returns the same extra id, confirmation id and hashes and writes nothing.
  const f = await siteFixture(c), a = f.members.supervisor.member, p = await photo(c, where(f)), raw = v3(f, { photoEvidenceId: p.id, shownContentSha256: shownFor(f, p.sha256) });
  const first = await repo.logSiteExtra(f.ctx, a, raw), before = await evidenceCounts(c, f), rows = await evidenceRowsText(c, f);
  for (let i = 0; i < 3; i++) {
   const again = await repo.logSiteExtra(f.ctx, a, raw);
   expect(again.variationId).toBe(first.variationId); expect(again.evidence).toEqual(first.evidence);
   expect(again.evidence!.residentConfirmationEvidenceId).toBe(confirmationIdFor(f, raw.commandId as string)); expect(again.evidence!.contentSha256).toBe(shownFor(f, p.sha256));
   expect(await evidenceCounts(c, f)).toEqual(before); expect(await evidenceRowsText(c, f)).toEqual(rows);
  }
  expect((await c.admin.query("SELECT document_check.n FROM (SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.resident_confirmation_recorded') document_check", [f.p.tenantId])).rows[0]!.n).toBe(1);
 });
 it("a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written", async () => {
  const f = await siteFixture(c), a = f.members.supervisor.member, p = await photo(c, where(f));
  await ownerTx(c, f.p.tenantId, db => db.$client.query("UPDATE app.job SET status='invoiced' WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.jobId]));
  const auditBefore = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.n;
  const before = await evidenceCounts(c, f), rows = await evidenceRowsText(c, f);
  for (const fields of [{ photoEvidenceId: p.id }, { photoEvidenceId: p.id, shownContentSha256: shownFor(f, p.sha256) }, { shownContentSha256: shownFor(f, null) }, {}]) {
   const raw = v3(f, fields), error = await errorOf(repo.logSiteExtra(f.ctx, a, raw));
   expect(error).toBeInstanceOf(WatchdogError); expect((error as WatchdogError).code).toBe("JOB_NOT_LIVE");
   expect(await evidenceCounts(c, f)).toEqual(before); expect(await evidenceRowsText(c, f)).toEqual(rows); expect(await refusalEvents(c, f, raw.commandId)).toEqual([]);
   expect((await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, raw.commandId])).rows[0]!.n).toBe(0);
  }
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.n).toBe(auditBefore);
 });
 it("an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job", async () => {
  const f = await siteFixture(c), foreign = await fixture(c), real = await photo(c, where(f));
  await ownerTx(c, f.p.tenantId, db => db.$client.query("UPDATE app.job SET status='invoiced' WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.otherJob]));
  const targets = [{ kind: "unknown", jobId: randomUUID() }, { kind: "foreign", jobId: foreign.jobId }, { kind: "not-live", jobId: f.otherJob }, { kind: "live", jobId: f.jobId }];
  for (const role of ["owner", "admin", "commercial_manager", "finance", "read_only", "client_approver"] as const) {
   const errors: Error[] = [];
   for (const photoEvidenceId of [real.id, randomUUID()]) for (const target of targets) {
    const error = await refused(f, f.members[role].member, v3(f, { jobId: target.jobId, photoEvidenceId, shownContentSha256: shownFor(f, real.sha256) }), "EXTRA_FORBIDDEN");
    expect({ status: siteExtraHttpStatus((error as SiteExtraError).code), body: siteExtraFailureV1.parse({ version: "site-extra-error.v1", code: (error as SiteExtraError).code }), code: (error as SiteExtraError).code }, `${role}: ${target.kind}`).toEqual({ status: 403, body: { version: "site-extra-error.v1", code: "EXTRA_FORBIDDEN" }, code: "EXTRA_FORBIDDEN" });
    errors.push(error);
   }
   // The not-live target does not answer JOB_NOT_LIVE, and no evidence step answers, before authority is checked.
   for (const error of errors) expect(error).toEqual(errors[0]);
  }
 });
});
