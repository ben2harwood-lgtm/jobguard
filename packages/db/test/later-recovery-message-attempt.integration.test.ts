import { testTenantContext } from './tenant-context-test-utils.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildRecoveryMessage, recoveryMessageSourceOf, RECOVERY_MESSAGE_CHANGED, recoveryCaseTermsHash } from '@jobguard/core';
import {
  ActionExecutor, EvidencePackRepository, FakeRecoveryMessageAdapter, RecoveryCaseRepository, RecoveryCaseTermsRepository, RecoveryMessageRepository, migrate, withTenant,
  type OutboundAdapter, type RecoveryMessageActor, type RecoveryMessageState, type VerifiedTenantContext,
} from '../src/index.js';
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from './pool-test-utils.js';
import { seedEvidencePackFixture } from './evidence-pack-fixture.js';

// Real PostgreSQL 16, real migrations, the real non-owner runtime role: no SQLite/ORM mock stands in for a guarantee here.
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
let fixture: Awaited<ReturnType<typeof seedEvidencePackFixture>>;
let context: VerifiedTenantContext, otherContext: VerifiedTenantContext;
let repo: RecoveryMessageRepository, packs: EvidencePackRepository, cases: RecoveryCaseRepository;
let actor: RecoveryMessageActor, memberActor: RecoveryMessageActor, revokedActor: RecoveryMessageActor;
const customerBody = 'Practice message — not sent. Our practice records show £320.00 net remains in this case. Please review the attached example records.';
const supplierBody = 'Practice message — not sent. Our practice supplier records show £320.00 net is questioned in this supplier correction case. Please review the attached example supplier records.';
const count = async (sql: string, args: unknown[] = []) => Number((await admin.query(sql, args)).rows[0].n);
const kinds = (view: { history: Array<{ kind: string }> }) => view.history.map(item => item.kind);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const OPENED = 2; // claim revision 1 + the opening event
/** The server-selected principal M4-1-S-R's workbench commands require: the fixture tenant's owner membership and its identity (a client reviewer field is ignored). */
const reviewerOf = async () => ({ membershipId: fixture.memberId, identityUserId: (await admin.query('SELECT identity_user_id FROM app.membership WHERE id=$1', [fixture.memberId])).rows[0].identity_user_id as string });

/** Fixture-only exact activation inputs; the existing v3 routine checks the
 * owner, accepted document, authorization and lifecycle before binding v3. */
async function activatePursuitFixture(client: import("pg").PoolClient, tenant: string, job: string, expected: number) {
  const row = (await client.query("SELECT d.id,d.document_version,d.content_hash,m.id actor FROM app.quote_document_version d JOIN app.membership m ON m.tenant_id=d.tenant_id AND m.role='owner' AND m.revoked_at IS NULL WHERE d.tenant_id=$1 AND d.job_id=$2", [tenant, job])).rows[0];
  const command = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
  await client.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'job.switch_live',$3,$4,'processing',$5)", [command, tenant, `pursuit-fixture:${job}`, row.content_hash, row.actor]);
  await client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'job.switch_live')", [decision, tenant, job]);
  await client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenant, decision, row.actor]);
  await client.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'job.switch_live',$6,$7,'synthetic_demo_activation.v3',clock_timestamp()+interval '1 hour')", [authorization, tenant, decision, resolution, row.actor, row.content_hash, row.document_version]);
  return client.query("SELECT app.switch_job_live_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [tenant, randomUUID(), randomUUID(), job, row.id, row.document_version, row.content_hash, expected, row.actor, command, authorization]);
}

/** Local current-schema recipe: replace exactly the primary fixture's first
 * v1 switch, after its accepted document/acceptance exist. All other SQL passes
 * through unchanged; the v3 activation itself supplies the commercial track. */
async function seedPursuitFixture() {
  let primaryJob: string | undefined, switches = 0, tracks = 0;
  const setup = new Proxy(admin, { get(pool, property) {
    if (property !== 'connect') { const value = Reflect.get(pool, property, pool); return typeof value === 'function' ? value.bind(pool) : value; }
    return async () => {
      const client = await pool.connect();
      return new Proxy(client, { get(target, key) {
        if (key !== 'query') { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; }
        return async (sql: string, values?: unknown[]) => {
          const args = values ? [...values] : undefined;
          if (sql === 'SELECT app.transition_job($1,$2,$3,$4,$5,$6,$7,$8,$9)' && args?.[4] === 'switch_live' && args[6] === 1880000) {
            expect(args.slice(2)).toEqual([2, 'live', 'switch_live', args[5], 1880000, 'reference_fee_policy_v1', 28200]);
            expect(switches++).toBe(0);
            primaryJob = String(args[1]);
            const document = (await target.query('SELECT id FROM app.quote_document_version WHERE tenant_id=$1 AND job_id=$2', [args[0], primaryJob])).rows;
            expect(document).toEqual([{ id: args[5] }]);
            return activatePursuitFixture(target, String(args[0]), primaryJob, Number(args[2]));
          }
          if (sql === "INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')" && args?.[1] === primaryJob) {
            expect(tracks++).toBe(0);
            const bound = await target.query('SELECT job_track,environment FROM app.job_commercial_track WHERE tenant_id=$1 AND job_id=$2', args);
            expect(bound.rows).toEqual([{ job_track: 'small_builder', environment: 'synthetic_demo' }]);
            return bound;
          }
          return target.query(sql, args);
        };
      } });
    };
  } });
  const seeded = await seedEvidencePackFixture(setup);
  expect({ switches, tracks, primaryJob }).toEqual({ switches: 1, tracks: 1, primaryJob: seeded.jobId });
  return seeded;
}

async function code(run: () => Promise<unknown>): Promise<string> {
  try { await run(); } catch (error) { return (error as { code?: string; message?: string }).code ?? (error as Error).message; }
  throw new Error('expected the call to fail');
}
async function newCase(caseType: 'withheld_customer_payment' | 'merchant_overcharge' | 'prevention' = 'withheld_customer_payment', claimPence = 32000) {
  const id = randomUUID();
  const refs = caseType === 'merchant_overcharge' ? [fixture.rateId, fixture.supplierInvoiceId, fixture.supplierDeliveryId] : [fixture.invoiceId];
  await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,$8,'GBP','identified',0,true,$4,'Fictional counterparty',$5,$6,$7)",
    [id, fixture.tenantId, fixture.jobId, caseType, caseType === 'merchant_overcharge' ? 'supplier_cost' : 'builder_customer', caseType === 'merchant_overcharge' ? 'supplier_documents' : 'customer_invoice', JSON.stringify(refs), claimPence]);
  await admin.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,$6,'GBP','fixture-owner',$5)", [randomUUID(), fixture.tenantId, fixture.jobId, id, hash(id), claimPence]);
  // A real case always starts with its opening event, so its revision is claim 1 + event 1.
  await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,$5,NULL,$6,'fixture-owner',$7,$8)",
    [randomUUID(), fixture.tenantId, fixture.jobId, id, caseType === 'prevention' ? 'prevent' : 'opened', caseType === 'prevention' ? 'prevented' : 'identified', randomUUID(), hash(`open:${id}`)]);
  if (caseType === 'withheld_customer_payment') {
    await new RecoveryCaseTermsRepository(runtime).approve(context, fixture.jobId, {
      version: 'recovery-case-terms-command.v1', action: 'approve', commandId: randomUUID(), caseId: id,
      termsVersion: 'synthetic_recovery_fee_terms.v1', feePolicyVersion: 'reference_fee_policy_v3',
      eligibilityPolicyVersion: 'reference_recovery_eligibility_policy_v3', termsHash: recoveryCaseTermsHash(id),
    }, { membershipId: fixture.memberId, identityUserId: (await reviewerOf()).identityUserId });
  }
  return id;
}
async function attached(caseType: 'withheld_customer_payment' | 'merchant_overcharge' = 'withheld_customer_payment', claimPence = 32000) {
  const caseId = await newCase(caseType, claimPence);
  const pack = await packs.generate(context, caseId, { commandId: randomUUID() }, actor.actorRef);
  await packs.approveAttachment(context, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
  return { caseId, pack };
}
const previewCommand = (state: RecoveryMessageState, commandId = randomUUID()) => ({
  version: 'recovery-message-preview.v1' as const, commandId, expectedCaseRevision: state.readiness.caseRevision, packId: state.readiness.packId!,
});
async function previewed(caseType: 'withheld_customer_payment' | 'merchant_overcharge' = 'withheld_customer_payment') {
  const { caseId, pack } = await attached(caseType);
  const state = await repo.preview(context, caseId, previewCommand(await repo.read(context, caseId)), actor);
  return { caseId, pack, state, view: state.latest! };
}
const approveCommand = (view: NonNullable<RecoveryMessageState['latest']>, commandId = randomUUID()) => ({
  version: 'recovery-message-command.v1' as const, commandId, action: 'approve' as const, messageId: view.id, expectedRevision: view.revision,
  recipient: view.message.recipient, body: view.message.body, amountPence: view.message.amountPence, packId: view.message.packId, contentHash: view.message.contentHash,
});
const advanceCommand = (view: NonNullable<RecoveryMessageState['latest']>, outcome: 'success' | 'response_lost' | 'no_response' | 'definite_failure' | 'process_stopped' = 'success', commandId = randomUUID()) => ({
  version: 'recovery-message-command.v1' as const, commandId, action: 'advance' as const, messageId: view.id, expectedRevision: view.revision, outcome,
});
const simple = (action: 'revoke' | 'reconcile', view: NonNullable<RecoveryMessageState['latest']>, commandId = randomUUID()) => ({
  version: 'recovery-message-command.v1' as const, commandId, action, messageId: view.id, expectedRevision: view.revision,
});
async function approved(caseType: 'withheld_customer_payment' | 'merchant_overcharge' = 'withheld_customer_payment') {
  const base = await previewed(caseType);
  const state = await repo.command(context, base.caseId, approveCommand(base.view), actor);
  return { ...base, state, view: state.latest! };
}
async function viewOf(caseId: string) { return (await repo.read(context, caseId)).latest!; }


/** A member of the current fixture's tenant (owner, member, or an already revoked owner). */
async function makeMember(role: string, revoked: boolean): Promise<RecoveryMessageActor> {
  const accountId = (await admin.query('SELECT account_id FROM app.membership WHERE id=$1', [fixture.memberId])).rows[0].account_id;
  const identity = randomUUID(), membership = randomUUID();
  await admin.query('INSERT INTO identity.identity_user(id) VALUES($1)', [identity]);
  await admin.query('INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at) VALUES($1,$2,$3,$4,$5,$6)', [membership, fixture.tenantId, accountId, identity, role, revoked ? new Date() : null]);
  return { membershipId: membership, actorRef: `membership:${membership}` };
}
/** Runs a test in a brand-new tenant, for changes (such as invalidating a proof) that must not leak into other tests. */
async function inIsolatedWorld<T>(run: () => Promise<T>): Promise<T> {
  const saved = { fixture, context, actor };
  fixture = await seedPursuitFixture();
  context = testTenantContext(fixture.tenantId);
  actor = { membershipId: fixture.memberId, actorRef: `membership:${fixture.memberId}` };
  try { return await run(); } finally { ({ fixture, context, actor } = saved); }
}
type Sql = (sql: string, args?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
async function inTenant<T>(run: (query: Sql) => Promise<T>) {
  return withTenant(runtime, context, db => run((sql, args) => db.$client.query(sql, args)));
}
const writeCounts = async () => {
  const one = async (table: string) => count(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1`, [fixture.tenantId]);
  return { decision: await one('decision'), resolution: await one('decision_resolution'), authorization: await one('action_authorization'), receipt: await one('command_receipt'),
    outbox: await one('action_outbox'), approval: await one('recovery_message_approval'), event: await one('recovery_message_event'), audit: await one('audit_event') };
};
const silent = { emit: () => undefined };
/** The shared outbox executor, driven directly by a worker-like caller rather than through the repository. */
const executorWith = (adapter: OutboundAdapter) => new ActionExecutor(runtime, new Map([[adapter.name, adapter]]), silent);
const practiceAdapter = (mode: 'success' | 'response_lost' | 'no_response' | 'definite_failure' | 'process_stopped' = 'success'): OutboundAdapter => {
  const fake = new FakeRecoveryMessageAdapter(runtime, mode), stamped = context;
  return { name: fake.name, supportsProviderDeduplication: fake.supportsProviderDeduplication, deliver: action => fake.deliver(stamped, action), reconcile: key => fake.reconcile(stamped, key) };
};
const outboxStatus = async (outboxId: string) => (await admin.query('SELECT status FROM app.action_outbox WHERE id=$1', [outboxId])).rows[0].status as string;
const sinkCount = (messageId: string) => count('SELECT count(*) n FROM app.recovery_message_sink WHERE message_id=$1', [messageId]);
const attemptCount = (outboxId: string) => count('SELECT count(*) n FROM app.action_attempt WHERE action_id=$1', [outboxId]);
const storedKinds = async (messageId: string) => (await admin.query('SELECT kind FROM app.recovery_message_event WHERE message_id=$1 ORDER BY revision', [messageId])).rows.map(row => row.kind as string);
const auditTypes = async (messageId: string) => (await admin.query("SELECT event_type FROM app.audit_event WHERE subject_type='recovery_message' AND subject_ref=$1 ORDER BY sequence", [messageId])).rows.map(row => row.event_type as string);
async function until(check: () => Promise<boolean>, what: string) {
  for (let attempt = 0; attempt < 100; attempt++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(`timed out waiting for ${what}`);
}
const amend = async (caseId: string, claimedNetPence: number, expectedRevision = OPENED) => cases.command(context, fixture.jobId, { version: 'recovery-case-command.v1', action: 'amend_claim', commandId: randomUUID(), caseId, claimedNetPence, reviewerRef: 'practice-owner', expectedRevision }, await reviewerOf());
/** The sink insert a forging caller would run, with the message's own approved values. */
const rawSink = (caseId: string, view: NonNullable<RecoveryMessageState['latest']>) => inTenant(query => query(`INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'raw','synthetic_demo',0)`, [randomUUID(), fixture.tenantId, view.message.jobId, caseId, view.id, view.approval!.outboxActionId, view.message.recipient, view.message.body, view.message.contentHash, view.message.attachmentHash]));
const rawEvent = (caseId: string, messageId: string, revision: number, kind: string, membershipId = fixture.memberId) => inTenant(query => query(
  `INSERT INTO app.recovery_message_event(id,tenant_id,job_id,case_id,message_id,revision,kind,command_id,request_hash,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic_demo')`,
  [randomUUID(), fixture.tenantId, fixture.jobId, caseId, messageId, revision, kind, randomUUID(), 'a'.repeat(64), membershipId]));
const insertPreview = (over: Record<string, unknown>, base: Awaited<ReturnType<typeof attached>> & { approvalId: string }) => {
  const message = buildRecoveryMessage({ caseId: base.caseId, jobId: fixture.jobId, caseType: 'withheld_customer_payment', caseRevision: OPENED, amountPence: 32000, sourceRefs: [fixture.invoiceId], packId: base.pack.id, packRevision: 1, manifestHash: base.pack.manifestHash, attachmentHash: base.pack.contentHash, ...(over.source as object | undefined) });
  const row = { id: randomUUID(), sequence: 1, content: message.immutableContent, hash: message.contentHash, body: message.body, recipient: message.recipient, sender: message.sender, amount: message.amountPence, caseRevision: message.caseRevision, packRevision: message.packRevision, ...over };
  return inTenant(query => query(`INSERT INTO app.recovery_message(id,tenant_id,job_id,case_id,case_sequence,pack_id,pack_revision,manifest_hash,attachment_hash,attachment_approval_id,command_id,request_hash,case_type,case_revision,amount_pence,currency,sender,recipient,body,policy_version,content_hash,immutable_content,actor_membership_id,environment)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'withheld_customer_payment',$13,$14,'GBP',$15,$16,$17,'practice-factual-message.v1',$18,$19,$20,'synthetic_demo')`,
  [row.id, fixture.tenantId, (over.jobId as string | undefined) ?? fixture.jobId, base.caseId, row.sequence, base.pack.id, row.packRevision, base.pack.manifestHash, base.pack.contentHash, base.approvalId, randomUUID(), hash(randomUUID()), row.caseRevision, row.amount, row.sender, row.recipient, row.body, row.hash, row.content, fixture.memberId]));
};
async function rawBase() {
  const base = await attached();
  const approvalId = (await admin.query('SELECT id FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND pack_id=$2', [fixture.tenantId, base.pack.id])).rows[0].id as string;
  return { ...base, approvalId };
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'jg-recovery-messages-'));
  const port = await freePort(60900, 200);
  const postgresLog: string[] = [];
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'synthetic', persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ['--lc-messages=C', '--encoding=UTF8'], onLog: message => { postgresLog.push(message); } });
  try { await postgres.initialise(); await postgres.start(); } catch (error) { throw new Error(`${String(error)}\n${postgresLog.join('\n')}`); }
  admin = new Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'synthetic', database: 'postgres' });
  // CH-3a: every job needs fictional parties before its quote document and live switch; the shared fixture recipe supplies them.
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin); fixture = await seedPursuitFixture();
  await admin.query("CREATE ROLE message_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO message_login");
  runtime = new Pool({ host: '127.0.0.1', port, user: 'message_login', password: 'synthetic', database: 'postgres', max: 12 });
  context = testTenantContext(fixture.tenantId);
  otherContext = testTenantContext(fixture.otherTenantId);
  repo = new RecoveryMessageRepository(runtime); packs = new EvidencePackRepository(runtime); cases = new RecoveryCaseRepository(runtime);
  actor = { membershipId: fixture.memberId, actorRef: `membership:${fixture.memberId}` };
  // A non-owner member and a revoked owner in the same tenant, for authority checks.
  memberActor = await makeMember('member', false); revokedActor = await makeMember('owner', true);
}, 120_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

afterEach(() => { vi.restoreAllMocks(); });

/** Holds the next delivery open after the executor has claimed it, so a second attempt can be observed while paused. */
function pauseNextDelivery() {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), reached = new Promise<void>(resolve => { entered = resolve; });
  const original = FakeRecoveryMessageAdapter.prototype.deliver;
  vi.spyOn(FakeRecoveryMessageAdapter.prototype, 'deliver').mockImplementationOnce(async function (this: FakeRecoveryMessageAdapter, ...args: Parameters<typeof original>) {
    entered(); await gate; return original.apply(this, args);
  });
  return { release, reached };
}
const count_ = async (messageId: string, type: string) => count("SELECT count(*) n FROM app.audit_event WHERE subject_type='recovery_message' AND subject_ref=$1 AND event_type=$2", [messageId, type]);

describe('LATER-B5 recovery message attempt isolation', () => {
  it('started second attempt cannot consume first attempt failure', async () => {
    const { caseId, view } = await approved();
    const failed = await repo.command(context, caseId, advanceCommand(view, 'definite_failure'), actor);
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved', 'started', 'retryable']);
    const outboxId = failed.latest!.approval!.outboxActionId;
    // Second attempt: its start is recorded, the executor has not claimed it yet, so the outbox still shows the FIRST attempt's failure.
    const lastRevision = failed.latest!.revision;
    await rawEvent(caseId, view.id, lastRevision + 1, 'started');
    expect(await outboxStatus(outboxId)).toBe('retryable');
    const before = await writeCounts();
    // Concurrent readers (each runs the history reconciliation) must not turn attempt 1's failure into attempt 2's result.
    await Promise.all([repo.read(context, caseId), repo.read(context, caseId), repo.read(context, caseId)]);
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved', 'started', 'retryable', 'started']);
    expect(await writeCounts()).toEqual(before);
    // Now the second attempt really runs and pauses mid-delivery; readers still add nothing.
    const paused = pauseNextDelivery();
    const running = repo.command(context, caseId, advanceCommand(await viewOf(caseId), 'success'), actor);
    await paused.reached;
    expect(await outboxStatus(outboxId)).toBe('executing');
    expect(await attemptCount(outboxId)).toBe(2);
    const mid = await writeCounts();
    await Promise.all([repo.read(context, caseId), repo.read(context, caseId)]);
    expect((await storedKinds(view.id)).at(-1)).toBe('started');
    expect(await writeCounts()).toEqual(mid);
    paused.release();
    await running;
    const kindsNow = await storedKinds(view.id);
    expect(kindsNow.filter(kind => kind === 'retryable')).toHaveLength(1);
    expect(kindsNow.filter(kind => kind === 'succeeded')).toHaveLength(1);
    expect(kindsNow.at(-1)).toBe('succeeded');
    expect(await sinkCount(view.id)).toBe(1);
    expect(await count_(view.id, 'recovery.message.succeeded')).toBe(1);
    expect(await count_(view.id, 'recovery.message.retryable')).toBe(1);
  });

  it('only the matching attempt can append terminal outcome', async () => {
    const { caseId, view } = await approved();
    const failed = await repo.command(context, caseId, advanceCommand(view, 'definite_failure'), actor);
    const outboxId = failed.latest!.approval!.outboxActionId;
    // Rollback: a terminal event that claims a success the latest attempt does not have is refused and leaves no trace.
    const events = await storedKinds(view.id), audits = await auditTypes(view.id);
    expect(await code(() => rawEvent(caseId, view.id, failed.latest!.revision + 1, 'succeeded'))).toBe('23514');
    expect(await code(() => rawEvent(caseId, view.id, failed.latest!.revision + 1, 'failed'))).toBe('23514');
    expect(await storedKinds(view.id)).toEqual(events);
    expect(await auditTypes(view.id)).toEqual(audits);
    // Second attempt ends unknown. It is its own unknown: the first attempt's retryable result is not reused, and reads keep it unknown.
    const unknown = await repo.command(context, caseId, advanceCommand(failed.latest!, 'response_lost'), actor);
    expect(unknown.latest!.status).toBe('outcome_unknown');
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved', 'started', 'retryable', 'started', 'outcome_unknown']);
    // Duplicate notifications: repeated reads and a repeated direct execution append nothing.
    const settled = await writeCounts();
    await Promise.all([repo.read(context, caseId), repo.read(context, caseId)]);
    await executorWith(practiceAdapter('success')).execute(context, outboxId);
    await repo.read(context, caseId);
    expect(await writeCounts()).toEqual(settled);
    expect(await outboxStatus(outboxId)).toBe('outcome_unknown');
    expect(await attemptCount(outboxId)).toBe(2);
    expect(await count_(view.id, 'recovery.message.outcome_unknown')).toBe(1);
    // The unknown stays unknown until its own reconciliation, which then closes it once.
    const done = await repo.command(context, caseId, simple('reconcile', unknown.latest!), actor);
    expect(done.latest!.status).toBe('simulated_delivery');
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved', 'started', 'retryable', 'started', 'outcome_unknown', 'reconcile_started', 'reconciled']);
    expect(await count_(view.id, 'recovery.message.reconciled')).toBe(1);
  });
});
