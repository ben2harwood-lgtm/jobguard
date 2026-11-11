import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { quoteDocumentV1, renderQuotePdf } from "@jobguard/core";
import { Pool } from "pg";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { QuoteDocumentRepository } from "../src/quote-document-repository.js";
import { QuoteAcceptanceRepository } from "../src/acceptance-repository.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const actor = "d1500000-0000-4000-8000-000000000003";
const migration = "0941_quote_firm_sequence.sql";
const recipient = "customer@example.invalid";
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
let f: WorkFixture, delivery: QuoteDeliveryRepository;
const previousEnvironment = process.env.JOBGUARD_ENV;
type Firm = Awaited<ReturnType<typeof firm>>;
type Job = Awaited<ReturnType<typeof job>>;
let legacyFirm: Firm, legacyJob: Job, legacyDuplicate: Job;
let historical: { id: string; job_id: string; snapshot: unknown; content_hash: string }[];

async function firm() {
 const token = randomUUID(), digest = sha(token);
 const db = await f.admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SET LOCAL ROLE jobguard_migration");
  await db.query("INSERT INTO control_plane.practice_session(token_digest) VALUES($1)", [digest]);
  await db.query("COMMIT");
 } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
 return { digest, auth: await authenticatePracticeSession(f.runtime, token) };
}
async function job(owner: Firm) {
 const id = randomUUID(), scope = randomUUID(), revision = randomUUID();
 await f.admin.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional painting','quoting',$3,'capture')", [id, tenant, owner.digest]);
 await f.admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, tenant, id]);
 await f.admin.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Paint walls','1','item',10000,10000)", [revision, tenant, id, scope]);
 const input = { jobId: id, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1",
  blockingQuestions: [], effectiveAt: new Date("2026-11-10T12:00:00Z"), lines: [{ id: randomUUID(), scopeItemId: scope, scopeRevisionId: revision,
   description: "Paint walls", origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 10000,
   discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Decorating", region: "London" }] };
 const saved = await new QuoteRepository(f.runtime).saveDraft(owner.auth.context, input);
 return { id, scope, input, quoteRevision: saved.id };
}
const preview = (owner: Firm, j: Job, email = recipient) => delivery.preview(owner.auth.context, j.id, email);
const issue = (owner: Firm, j: Job, p: Awaited<ReturnType<typeof preview>>, commandId = randomUUID()) =>
 delivery.issue(owner.auth.context, j.id, { documentId: p.documentId, contentHash: p.hash, recipient, commandId });

beforeAll(async () => {
 process.env.JOBGUARD_ENV = "synthetic_demo";
 f = await createWorkFixture(false);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [migration]);
 await migrate(f.admin); await installLegacySyntheticPartyFixtures(f.admin);
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
 const user = "d1500000-0000-4000-8000-000000000001", account = randomUUID();
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
 await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional builder')", [account, tenant]);
 await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [actor, tenant, account, user]);
 await f.admin.query("CREATE ROLE quote_preview_login LOGIN PASSWORD 'synthetic-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO quote_preview_login");
 await f.runtime.end(); f.runtime = new Pool({ ...f.admin.options, user: "quote_preview_login", password: "synthetic-only", max: 2 });
 delivery = new QuoteDeliveryRepository(f.runtime);
 legacyFirm = await firm(); legacyJob = await job(legacyFirm); legacyDuplicate = await job(legacyFirm);
 // Supplied historical artifacts remain supported; runtime preview must use the allocator.
 const documents = new QuoteDocumentRepository(f.runtime);
 for (const j of [legacyJob, legacyDuplicate]) {
  const document = { schemaVersion: "quote-document.v1", documentVersion: 1, reference: "Q-0001", quoteRevisionId: j.quoteRevision, currency: "GBP",
   issuer: { name: "Fictional legacy builder", address: ["1 Fictional Road"], email: "builder@example.invalid" },
   customer: { name: "Fictional customer", address: ["2 Fictional Road"], email: recipient },
   lines: [{ scopeItemId: j.scope, description: "Paint walls", quantity: "1", unit: "item", netPence: 10000 }],
   exclusions: [], qualifications: [], subtotalPence: 10000, discountPence: 0, netPence: 10000, taxPence: 2000, totalPence: 12000 };
  await documents.create(legacyFirm.auth.context, { jobId: j.id, documentId: randomUUID(), quoteRevisionId: j.quoteRevision, objectVersionId: "fictional-v1", document });
 }
 // An issued/accepted older document outranks a later unsent legacy preview.
 const old = (await f.admin.query("SELECT id,snapshot,content_hash FROM app.quote_document_version WHERE job_id=$1", [legacyJob.id])).rows[0];
 await delivery.issue(legacyFirm.auth.context, legacyJob.id, { documentId: old.id, contentHash: old.content_hash, recipient, commandId: randomUUID() });
 await new QuoteAcceptanceRepository(f.runtime).accept(legacyFirm.auth.context, legacyJob.id, { commandId: randomUUID(), documentId: old.id,
  documentHash: old.content_hash, documentVersion: 1, statedCustomerName: "Fictional customer", statedMethod: "email", acceptedAt: new Date().toISOString() });
 await documents.create(legacyFirm.auth.context, { jobId: legacyJob.id, documentId: randomUUID(), quoteRevisionId: legacyJob.quoteRevision,
  objectVersionId: "fictional-v2", document: { ...old.snapshot, documentVersion: 2, reference: "Q-0009", cancellationKit: undefined } });
 historical = (await f.admin.query("SELECT * FROM app.quote_document_version ORDER BY job_id,document_version")).rows;
 await f.admin.query("DELETE FROM public.jobguard_schema_migration WHERE migration_name=$1", [migration]); await migrate(f.admin);
}, 120_000);
afterAll(async () => {
 if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
 await closeWorkFixture(f);
});

it("two runtime previews use one firm sequence and a revised quote retains its reference", async () => {
 const owner = await firm(), a = await job(owner), b = await job(owner);
 const first = await preview(owner, a), second = await preview(owner, b);
 expect([first.document.reference, second.document.reference]).toEqual(["Q-0001", "Q-0002"]);
 expect((await preview(owner, a)).documentId).toBe(first.documentId);
 await new QuoteRepository(f.runtime).saveDraft(owner.auth.context, { ...a.input, expectedRevision: 1 });
 const revised = await preview(owner, a);
 expect(revised.document.reference).toBe("Q-0001"); expect(revised.document.documentVersion).toBe(2);
 for (const p of [first, second, revised]) {
  expect(p.document.cancellationKit?.reference).toBe(p.document.reference);
  expect(new TextDecoder().decode(p.pdf)).toContain(p.document.reference);
  expect(await delivery.view(owner.auth.context, p === second ? b.id : a.id, p.documentId)).toMatchObject({ documentId: p.documentId, reference: p.document.reference, documentVersion: p.document.documentVersion });
 }
 expect((await preview(owner, await job(owner))).document.reference).toBe("Q-0003");
});

it("serializes concurrent different jobs and same-job reuse or new document versions", async () => {
 const owner = await firm(), a = await job(owner), b = await job(owner);
 const different = await Promise.all([preview(owner, a), preview(owner, b)]);
 expect(different.map(p => p.document.reference).sort()).toEqual(["Q-0001", "Q-0002"]);
 const same = await Promise.all([preview(owner, a), preview(owner, a)]);
 expect(same[0].documentId).toBe(same[1].documentId);
 const changed = await Promise.all([preview(owner, a, "a@example.invalid"), preview(owner, a, "b@example.invalid")]);
 expect(new Set(changed.map(p => p.document.documentVersion)).size).toBe(2);
 expect(new Set(changed.map(p => p.document.reference)).size).toBe(1);
 const reused = await preview(owner, a, "a@example.invalid");
 expect(reused.documentId).toBe(changed[0]!.documentId);
 expect(await delivery.view(owner.auth.context, a.id, reused.documentId)).toMatchObject({ documentId: reused.documentId,
  documentVersion: changed[0]!.document.documentVersion, reference: changed[0]!.document.reference });
 const view = await delivery.view(owner.auth.context, a.id);
 expect(view?.quoteRevision).toBe(1); expect(view!.documentVersion).toBeGreaterThan(1);
});

it("does not consume a number on failure and refuses foreign firms and tenants before reuse", async () => {
 const owner = await firm(), other = await firm(), a = await job(owner);
 await new QuoteRepository(f.runtime).saveDraft(owner.auth.context, { ...a.input, expectedRevision: 1, blockingQuestions: ["Unanswered fictional question"] });
 await expect(preview(owner, a)).rejects.toThrow("QUOTE_NOT_ISSUABLE");
 expect((await preview(owner, await job(owner))).document.reference).toBe("Q-0001");
 await new QuoteRepository(f.runtime).saveDraft(owner.auth.context, { ...a.input, expectedRevision: 2 });
 expect((await preview(owner, a)).document.reference).toBe("Q-0002");
 await expect(preview(other, a)).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 const otherTenant = randomUUID(), otherJob = randomUUID();
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [otherTenant]);
 await f.admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional foreign job')", [otherJob, otherTenant]);
 await expect(preview(owner, { ...a, id: otherJob })).rejects.toThrow("QUOTE_REFERENCE_REFUSED");
 expect((await preview(other, await job(other))).document.reference).toBe("Q-0001");
});

it("issue, replay, delivery and cancellation preserve exact documents and accepted identity after another preview", async () => {
 const owner = await firm(), a = await job(owner), original = await preview(owner, a), command = randomUUID();
 await issue(owner, a, original, command);
 expect(await issue(owner, a, original, command)).toMatchObject({ documentId: original.documentId, reference: "Q-0001" });
 await expect(delivery.issue(owner.auth.context, a.id, { documentId: original.documentId, contentHash: original.hash, recipient: "changed@example.invalid", commandId: command })).rejects.toBeTruthy();
 await delivery.execute(owner.auth.context, a.id, original.documentId, "success");
 const acceptances = new QuoteAcceptanceRepository(f.runtime);
 await acceptances.accept(owner.auth.context, a.id, { commandId: randomUUID(), documentId: original.documentId, documentHash: original.hash,
  documentVersion: original.document.documentVersion, statedCustomerName: "Fictional customer", statedMethod: "email", acceptedAt: new Date().toISOString() });
 await preview(owner, await job(owner));
 const latest = await preview(owner, a, "new@example.invalid");
 const view = await delivery.view(owner.auth.context, a.id);
 expect(view?.documentId).toBe(latest.documentId);
 expect(view?.acceptedDocumentReferences).toEqual({ [original.documentId]: { reference: "Q-0001", documentVersion: 1 } });
 expect(await delivery.pdf(owner.auth.context, a.id, original.documentId)).toMatchObject({ pdf: original.pdf, hash: original.hash, version: 1 });
 await acceptances.disposition(owner.auth.context, a.id, { commandId: randomUUID(), documentId: original.documentId, documentHash: original.hash,
  documentVersion: 1, kind: "acceptance_cancelled", occurredAt: new Date().toISOString() });
 expect((await delivery.view(owner.auth.context, a.id))?.acceptedDocumentReferences).toEqual({});
 expect((await preview(owner, a)).document.reference).toBe("Q-0001");
 expect((await delivery.pdf(owner.auth.context, a.id, original.documentId)).pdf).toEqual(original.pdf);
 expect((await preview(owner, await job(owner))).document.reference).toBe("Q-0003");
});

it("upgrade preserves historical duplicate PDFs and hashes and pins future runtime previews", async () => {
 const before = historical.map(row => ({ ...row }));
 const accepted = historical.find(row => row.job_id === legacyJob.id && quoteDocumentV1.parse(row.snapshot).documentVersion === 1)!;
 const legacyView = await delivery.view(legacyFirm.auth.context, legacyJob.id);
 expect(legacyView?.reference).toBe("Q-0009");
 expect(legacyView?.acceptedDocumentReferences).toEqual({ [accepted.id]: { reference: "Q-0001", documentVersion: 1 } });
 for (const j of [legacyJob, legacyDuplicate]) {
  const p = await preview(legacyFirm, j);
  expect(p.document.reference).toBe("Q-0001"); expect(p.document.documentVersion).toBe(j === legacyJob ? 3 : 2);
 }
 const after = (await f.admin.query("SELECT * FROM app.quote_document_version WHERE id=ANY($1::uuid[]) ORDER BY job_id,document_version", [historical.map(row => row.id)])).rows;
 expect(after).toEqual(before);
 for (const row of historical) {
  const pdf = await delivery.pdf(legacyFirm.auth.context, row.job_id, row.id);
  expect(pdf.pdf).toEqual(renderQuotePdf(quoteDocumentV1.parse(row.snapshot))); expect(sha(pdf.pdf)).toBe(row.content_hash);
 }
 expect((await preview(legacyFirm, await job(legacyFirm))).document.reference).toBe("Q-0010");
});
