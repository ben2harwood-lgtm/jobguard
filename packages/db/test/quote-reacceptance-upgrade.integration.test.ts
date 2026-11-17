import { RecordBuilderAcceptanceMutation, RecordQuoteDispositionMutation } from "./lp3-legacy-fixtures.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  QuoteRepository, QuoteDocumentRepository, IssueQuoteMutation,
  UserCommandDispatcher,
  withTenant, type ConsequentialCommand,
} from "../src/index.js";
import { clusterBefore } from "./site-extra-pricing-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// QUOTE-REACCEPT upgrade proof: a database at 0153 holding an accepted-then-cancelled quote (rows written by the OLD routines, no side-table row)
// is upgraded by 0155 alone; the old rows are byte-identical afterwards and the same quote can then be accepted again as sequence 2.
const own = "0155_quote_reacceptance.sql";
let c: Awaited<ReturnType<typeof clusterBefore>>;
const expiresAt = new Date("2099-01-01T00:00:00Z");
async function issued() {
  const tenant = randomUUID(), member = randomUUID(), account = randomUUID(), user = randomUUID();
  const job = randomUUID(), scope = randomUUID(), revisionId = randomUUID(), draft = randomUUID();
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional MIGFIX builder')", [tenant, account]);
  await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenant, member, account, user]);
  const context = testTenantContext(tenant);
  await withTenant(c.admin, context, async db => {
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
  });
  await withTenant(c.runtime, context, async db => {
    await db.$client.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenant, scope, job]);
    await db.$client.query("INSERT INTO app.scope_revision(tenant_id,id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fit cabinet','1','each',10000,10000)", [tenant, revisionId, job, scope]);
  });
  const priced = await new QuoteRepository(c.runtime).saveDraft(context, {
    jobId: job, draftId: draft, expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1",
    blockingQuestions: [], effectiveAt: new Date("2026-10-01T10:00:00Z"),
    lines: [{ id: randomUUID(), scopeItemId: scope, scopeRevisionId: revisionId, description: "Fit cabinet", origin: "captured",
      included: true, exclusionReason: null, quantity: "1", unit: "each", unitRatePence: 10000,
      discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Joinery", region: "London" }],
  });
  const document = randomUUID();
  const artifact = await new QuoteDocumentRepository(c.runtime).create(context, {
    jobId: job, documentId: document, quoteRevisionId: priced.id, objectVersionId: "fictional-immutable-v1",
    document: { schemaVersion: "quote-document.v1", documentVersion: 1, reference: "Q-MIGFIX-4", quoteRevisionId: priced.id,
      currency: "GBP", issuer: { name: "Fictional builder", address: ["1 Fictional Street"], email: "builder@example.invalid" },
      customer: { name: "Fictional customer", address: ["2 Fictional Street"], email: "customer@example.invalid" },
      lines: [{ scopeItemId: scope, description: "Fit cabinet", quantity: "1", unit: "each", netPence: 10000 }],
      exclusions: [], qualifications: ["Synthetic only"], subtotalPence: 10000, discountPence: 0, netPence: 10000, taxPence: 2000, totalPence: 12000 },
  });
  const hash = artifact.content_hash, dispatcher = new UserCommandDispatcher(c.admin);
  await dispatcher.dispatch(context, {
    version: "command.v1", commandId: randomUUID(), commandType: "quote.issue", semanticKey: `issue:${document}`,
    actorMembershipId: member, subjectType: "quote_document", subjectRef: document, authorizationId: randomUUID(),
    action: { actionType: "quote.send", recipient: JSON.stringify(["customer@example.invalid"]), contentHash: hash,
      aggregateRevision: 1, amountPence: null, currency: null, policyVersion: "free-quote-send.v1", expiresAt },
  }, new IssueQuoteMutation({ tenantId: tenant, jobId: job, documentId: document, outboxActionId: randomUUID(),
    recipients: ["customer@example.invalid"], immutableContent: new TextDecoder().decode(artifact.pdf) }));
  return { tenant, member, job, document, hash, context, dispatcher };
}
type Fixture = Awaited<ReturnType<typeof issued>>;
function acceptance(f: Fixture, expected = 0, method: "verbal" | "email" | "message" | "signed-paper" = "email") {
  const command: ConsequentialCommand = { version: "command.v1", commandId: randomUUID(), commandType: "quote.acceptance.attest",
    semanticKey: `accept:${f.document}`, actorMembershipId: f.member, subjectType: "quote_document", subjectRef: f.document,
    action: { actionType: "quote.acceptance.attest", recipient: "Fictional customer", contentHash: f.hash, aggregateRevision: 1,
      amountPence: 12000, currency: "GBP", policyVersion: "builder-attestation.v1", expiresAt } };
  const input = { version: "quote-acceptance.v1", acceptanceId: randomUUID(), jobId: f.job, documentId: f.document,
    documentVersion: 1, documentHash: f.hash, expectedJobRevision: expected, acceptedTotalPence: 12000,
    acceptedAt: new Date("2026-10-01T12:00:00Z"), statedCustomerName: "Fictional customer", statedMethod: method, evidenceId: null };
  return { command, input, mutation: new RecordBuilderAcceptanceMutation(f.tenant, input) };
}
function disposition(f: Fixture, expected = 0, kind: "superseded" | "acceptance_cancelled" | "declined" = "superseded") {
  const command: ConsequentialCommand = { version: "command.v1", commandId: randomUUID(), commandType: `quote.${kind}`,
    semanticKey: `${kind}:${f.document}`, actorMembershipId: f.member, subjectType: "quote_document", subjectRef: f.document,
    action: { actionType: `quote.${kind}`, recipient: null, contentHash: f.hash, aggregateRevision: 1,
      amountPence: null, currency: null, policyVersion: "quote-disposition.v1", expiresAt } };
  const input = { version: "quote-disposition.v1", eventId: randomUUID(), jobId: f.job, documentId: f.document,
    documentVersion: 1, documentHash: f.hash, expectedJobRevision: expected, kind, occurredAt: new Date("2026-10-01T13:00:00Z") };
  return { command, input, mutation: new RecordQuoteDispositionMutation(f.tenant, input) };
}

beforeAll(async () => { c = await clusterBefore(own); }, 120_000);
afterAll(async () => { await c?.close(); });
const rowsText = async (f: Fixture) => (await c.admin.query("SELECT row_to_json(a)::text b FROM app.quote_acceptance a WHERE tenant_id=$1 ORDER BY id", [f.tenant])).rows.map(r => r.b as string);
const eventsText = async (f: Fixture) => (await c.admin.query("SELECT row_to_json(e)::text b FROM app.acceptance_event e WHERE tenant_id=$1 ORDER BY id", [f.tenant])).rows.map(r => r.b as string);

describe("0155 upgrade over populated acceptance history", () => {
  it("keeps old acceptance rows byte for byte and then accepts the same document again as sequence 2", async () => {
    const f = await issued();
    // Old routine: one acceptance, then its cancellation.
    const first = acceptance(f); await f.dispatcher.dispatch(f.context, first.command, first.mutation);
    const cancel = disposition(f, 1, "acceptance_cancelled"); await f.dispatcher.dispatch(f.context, cancel.command, cancel.mutation);
    const rowsBefore = await rowsText(f), eventsBefore = await eventsText(f);
    expect(rowsBefore).toHaveLength(1);
    // The old routine refuses a second acceptance of the cancelled document (the audit defect), which is why 0155 exists.
    const old = acceptance(f, 2); await expect(f.dispatcher.dispatch(f.context, { ...old.command, semanticKey: `accept:${f.document}:2` }, old.mutation)).rejects.toBeTruthy();
    await c.migrate();
    expect(await rowsText(f)).toEqual(rowsBefore); expect(await eventsText(f)).toEqual(eventsBefore);
    expect((await c.admin.query("SELECT count(*)::int n FROM app.quote_acceptance_sequence WHERE tenant_id=$1", [f.tenant])).rows[0].n).toBe(0);
    const again = acceptance(f, 2, "message");
    await f.dispatcher.dispatch(f.context, { ...again.command, semanticKey: `accept:${f.document}:2` }, again.mutation);
    const sequence = (await c.admin.query("SELECT acceptance_sequence,replaces_acceptance_id,acceptance_id FROM app.quote_acceptance_sequence WHERE tenant_id=$1", [f.tenant])).rows;
    expect(sequence).toHaveLength(1);
    expect(sequence[0]).toMatchObject({ acceptance_sequence: 2 });
    expect(sequence[0].replaces_acceptance_id).toBe(JSON.parse(rowsBefore[0]!).id);
    const job = (await c.admin.query("SELECT status,accepted_quote_version_id FROM app.job WHERE tenant_id=$1 AND id=$2", [f.tenant, f.job])).rows[0];
    expect(job).toEqual({ status: "accepted", accepted_quote_version_id: f.document });
    expect(await rowsText(f)).toHaveLength(2);
  }, 60_000);
});
