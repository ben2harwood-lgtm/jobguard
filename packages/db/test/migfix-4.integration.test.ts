import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  QuoteRepository, QuoteDocumentRepository, IssueQuoteMutation,
  RecordBuilderAcceptanceMutation, RecordQuoteDispositionMutation, UserCommandDispatcher,
  withTenant, type ConsequentialCommand, type CommandMutation, type TenantTransaction,
} from "../src/index.js";
import { clusterBefore } from "./site-extra-pricing-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { rolledBack } from "./upgrade-proof-utils.js";

const own = "0153_quote_supersession_guard.sql";
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
  const hash = artifact.content_hash, dispatcher = new UserCommandDispatcher(c.runtime);
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
async function state(f: Fixture) {
  return (await c.admin.query(`SELECT status,revision,accepted_quote_version_id,
    (SELECT count(*)::int FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2) AS acceptances,
    (SELECT count(*)::int FROM app.acceptance_event WHERE tenant_id=$1 AND job_id=$2 AND kind='accepted') AS accepted_events,
    (SELECT count(*)::int FROM app.acceptance_event WHERE tenant_id=$1 AND job_id=$2 AND kind='superseded') AS superseded_events
    FROM app.job WHERE tenant_id=$1 AND id=$2`, [f.tenant, f.job])).rows[0]!;
}
async function execute(f: Fixture, action: ReturnType<typeof acceptance> | ReturnType<typeof disposition>) {
  return f.dispatcher.dispatch(f.context, action.command, action.mutation);
}

beforeAll(async () => { c = await clusterBefore(own); await c.migrate(); }, 120_000);
afterAll(async () => { await c?.close(); });

describe("MIGFIX-4 exact quote acceptance", () => {
  it("[MIGFIX-4.1] supersession invalidates pending acceptance", async () => {
    const f = await issued(), pending = acceptance(f), supersede = disposition(f);
    await execute(f, supersede);
    await expect(execute(f, pending)).rejects.toMatchObject({ code: "40001" });
    expect(await state(f)).toEqual({ status: "quoting", revision: 1, accepted_quote_version_id: null, acceptances: 0, accepted_events: 0, superseded_events: 1 });
    expect((await c.admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.tenant, pending.command.commandId])).rowCount).toBe(0);
    expect((await c.admin.query("SELECT 1 FROM app.decision WHERE tenant_id=$1 AND action_type='quote.acceptance.attest'", [f.tenant])).rowCount).toBe(0);
    expect((await c.admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='quote.acceptance.attested'", [f.tenant])).rowCount).toBe(0);
  });
  it("[MIGFIX-4.2] superseded document cannot be accepted with a fresh revision", async () => {
    const f = await issued(); await execute(f, disposition(f));
    const revision = (await state(f)).revision as number;
    await expect(execute(f, acceptance(f, revision))).rejects.toMatchObject({ code: "22023", message: "superseded exact quote" });
    expect(await state(f)).toMatchObject({ status: "quoting", accepted_quote_version_id: null, acceptances: 0, accepted_events: 0 });
  });
  it("[MIGFIX-4.3] acceptance and supersession serialize on the job", async () => {
    for (const firstKind of ["superseded", "accepted"] as const) {
      const f = await issued(), a = acceptance(f), s = disposition(f);
      const first = firstKind === "superseded" ? s : a, second = firstKind === "superseded" ? a : s;
      let release!: () => void, reached!: () => void;
      const hold = new Promise<void>(resolve => { release = resolve; });
      const ready = new Promise<void>(resolve => { reached = resolve; });
      let pid = 0;
      const held: CommandMutation<Record<string, unknown>> = {
        async mutate(db: TenantTransaction, command: ConsequentialCommand) {
          pid = (await db.$client.query("SELECT pg_backend_pid() AS pid")).rows[0]!.pid as number;
          const result = await first.mutation.mutate(db, command); reached(); await hold; return result;
        },
        auditEvents: (result, command) => first.mutation.auditEvents(result, command),
      };
      const winner = f.dispatcher.dispatch(f.context, first.command, held);
      // If fixture or mutation fails before the barrier, propagate it instead of hanging.
      await Promise.race([ready, winner.then(() => { throw new Error("barrier not reached"); })]);
      const waiting = execute(f, second).then(value => ({ value, code: "success" }), error => ({ value: null, code: error.code as string }));
      try {
        const deadline = Date.now() + 10_000;
        let blocked = false;
        while (Date.now() < deadline) {
          blocked = Boolean((await c.admin.query("SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))", [pid])).rowCount);
          if (blocked) break;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        expect(blocked, "second transaction is waiting on the first job lock").toBe(true);
      } finally { release(); await winner; }
      expect((await waiting).code).toBe("40001");
      const now = await state(f);
      expect(now).toEqual(firstKind === "superseded"
        ? { status: "quoting", revision: 1, accepted_quote_version_id: null, acceptances: 0, accepted_events: 0, superseded_events: 1 }
        : { status: "accepted", revision: 1, accepted_quote_version_id: f.document, acceptances: 1, accepted_events: 1, superseded_events: 0 });
      if (firstKind === "accepted") await expect(execute(f, disposition(f, 1))).rejects.toMatchObject({ code: "22023", message: "disposition is not allowed" });
      else await expect(execute(f, acceptance(f, 1))).rejects.toMatchObject({ code: "22023", message: "superseded exact quote" });
    }
  }, 30_000);
  it("[MIGFIX-4.4] issued unsuperseded control accepts once and original command replays without duplicate effects", async () => {
    for (const method of ["verbal", "email", "message", "signed-paper"] as const) {
      const f = await issued(), a = acceptance(f, 0, method);
      const original = await execute(f, a);
      const effects = async () => (await c.admin.query(`SELECT
        (SELECT count(*) FROM app.command_receipt WHERE tenant_id=$1)::int receipts,
        (SELECT count(*) FROM app.audit_event WHERE tenant_id=$1)::int audits,
        (SELECT count(*) FROM app.action_authorization WHERE tenant_id=$1)::int authorizations,
        (SELECT count(*) FROM app.journal WHERE tenant_id=$1)::int journals,
        (SELECT count(*) FROM app.synthetic_obligation WHERE tenant_id=$1)::int obligations`, [f.tenant])).rows[0];
      const before = await effects();
      expect(await execute(f, a)).toEqual(original);
      expect(await effects()).toEqual(before); expect(before).toMatchObject({ journals: 0, obligations: 0 });
      expect(await state(f)).toEqual({ status: "accepted", revision: 1, accepted_quote_version_id: f.document, acceptances: 1, accepted_events: 1, superseded_events: 0 });
      const stored = (await c.admin.query("SELECT acceptance_kind,stated_method,document_id,document_version,document_hash,accepted_total_pence FROM app.quote_acceptance WHERE tenant_id=$1", [f.tenant])).rows[0];
      expect(stored).toMatchObject({ acceptance_kind: "builder_attestation", stated_method: method, document_id: f.document, document_version: 1, document_hash: f.hash, accepted_total_pence: "12000" });
      await expect(f.dispatcher.dispatch(f.context, { ...a.command, action: { ...a.command.action, amountPence: 1 } }, a.mutation)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
      await execute(f, disposition(f, 1, "acceptance_cancelled"));
      expect(await state(f)).toMatchObject({ status: "quoting", revision: 2, accepted_quote_version_id: null, acceptances: 1, accepted_events: 1 });
    }
  });
  it("[MIGFIX-4.4] supersession original command replays without a second event or revision", async () => {
    const f = await issued(), s = disposition(f); const result = await execute(f, s), before = await state(f);
    expect(await execute(f, s)).toEqual(result); expect(await state(f)).toEqual(before);
  });
  it("[MIGFIX-4.exact] exact document hash, version, total, issue record and live baseline refusals remain", async () => {
    const f = await issued(), a = acceptance(f);
    for (const input of [{ ...a.input, documentHash: "b".repeat(64) }, { ...a.input, documentVersion: 2 }, { ...a.input, acceptedTotalPence: 1 }, { ...a.input, documentId: randomUUID() }]) {
      await expect(withTenant(c.runtime, f.context, db => new RecordBuilderAcceptanceMutation(f.tenant, input).mutate(db, {
        ...a.command, action: { ...a.command.action, contentHash: input.documentHash, aggregateRevision: input.documentVersion, amountPence: input.acceptedTotalPence },
      }))).rejects.toMatchObject({ code: "22023" });
    }
    // A document with no matching send must also fail even when its identity and exact terms match.
    await rolledBack(c.admin, async db => {
      await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenant]);
      await db.query("SET LOCAL session_replication_role=replica");
      await db.query("UPDATE app.quote_send SET content_hash=$2 WHERE tenant_id=$1", [f.tenant, "b".repeat(64)]);
      await expect(db.query("SELECT * FROM app.record_builder_attested_acceptance($1,$2,$3,$4,$5,1,$6,12000,0,$7,'Fictional customer','email',clock_timestamp(),NULL)", [f.tenant, randomUUID(), randomUUID(), f.job, f.document, f.hash, f.member])).rejects.toMatchObject({ code: "22023" });
    });
    await execute(f, a);
    // The live-entry parties guard reads a FORCE-RLS table, so the admin session must carry the tenant setting.
    const admin = await c.admin.connect();
    try {
      await admin.query("BEGIN");
      await admin.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenant]);
      await admin.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [f.tenant, f.job]);
      await admin.query("COMMIT");
    } catch (error) { await admin.query("ROLLBACK"); throw error; } finally { admin.release(); }
    await expect(execute(f, disposition(f, 1))).rejects.toMatchObject({ code: "22023" });
    await expect(execute(f, disposition(f, 1, "acceptance_cancelled"))).rejects.toMatchObject({ code: "22023" });
    expect(await state(f)).toMatchObject({ status: "live", accepted_quote_version_id: f.document, acceptances: 1 });
  });
  it("[MIGFIX-4.authority] routine authority is checked before unknown, foreign, quoting, accepted or live job state", async () => {
    const f = await issued(), foreign = await issued();
    // Put same-tenant accepted/live controls into f's tenant without moving commercial rows.
    const acceptedJob = randomUUID(), liveJob = randomUUID();
    await c.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional accepted control','accepted'),($1,$3,'Fictional live control','live')", [f.tenant, acceptedJob, liveJob]);
    for (const actor of [randomUUID(), f.member]) {
      if (actor === f.member) await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.tenant, f.member]);
      for (const job of [randomUUID(), foreign.job, f.job, acceptedJob, liveJob]) {
        await expect(withTenant(c.runtime, f.context, db => db.$client.query(
          "SELECT * FROM app.record_builder_attested_acceptance($1,$2,$3,$4,$5,1,$6,12000,0,$7,'Fictional customer','email',clock_timestamp(),NULL)",
          [f.tenant, randomUUID(), randomUUID(), job, f.document, f.hash, actor],
        ))).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
        await expect(withTenant(c.runtime, f.context, db => db.$client.query(
          "SELECT * FROM app.record_quote_disposition($1,$2,$3,$4,1,$5,0,$6,'superseded',clock_timestamp())",
          [f.tenant, randomUUID(), job, f.document, f.hash, actor],
        ))).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
      }
    }
  });
});
