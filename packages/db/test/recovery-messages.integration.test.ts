import { testTenantContext } from './tenant-context-test-utils.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildRecoveryMessage, recoveryMessageSourceOf, RECOVERY_MESSAGE_CHANGED } from '@jobguard/core';
import {
  ActionExecutor, EvidencePackRepository, FakeRecoveryMessageAdapter, RecoveryCaseRepository, RecoveryMessageRepository, migrate, withTenant,
  type OutboundAdapter, type RecoveryMessageActor, type RecoveryMessageState, type VerifiedTenantContext,
} from '../src/index.js';
import { closeTestPools, installLegacySyntheticPartyFixtures } from './pool-test-utils.js';
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
  fixture = await seedEvidencePackFixture(admin);
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
  const port = 60900 + Math.floor(Math.random() * 200);
  const postgresLog: string[] = [];
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'synthetic', persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ['--lc-messages=C', '--encoding=UTF8'], onLog: message => { postgresLog.push(message); } });
  try { await postgres.initialise(); await postgres.start(); } catch (error) { throw new Error(`${String(error)}\n${postgresLog.join('\n')}`); }
  admin = new Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'synthetic', database: 'postgres' });
  // CH-3a: every job needs fictional parties before its quote document and live switch; the shared fixture recipe supplies them.
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin); fixture = await seedEvidencePackFixture(admin);
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

describe('previewing a source-bound factual message', () => {
  it('previews only over a recorded, attachment-approved, still-current evidence pack', async () => {
    const caseId = await newCase();
    expect(await repo.read(context, caseId)).toMatchObject({ messages: [], latest: null, sinkCount: 0, readiness: { eligible: false, reason: 'PACK_REQUIRED', packId: null, caseRevision: OPENED } });
    expect(await code(() => repo.preview(context, caseId, { version: 'recovery-message-preview.v1', commandId: randomUUID(), expectedCaseRevision: 1, packId: randomUUID() }, actor))).toBe('RECOVERY_MESSAGE_SOURCES_REQUIRED');
    const pack = await packs.generate(context, caseId, { commandId: randomUUID() }, actor.actorRef);
    expect((await repo.read(context, caseId)).readiness).toMatchObject({ eligible: false, reason: 'ATTACHMENT_APPROVAL_REQUIRED', packId: pack.id });
    expect(await code(() => repo.preview(context, caseId, previewCommand({ readiness: { caseRevision: OPENED, packId: pack.id } } as RecoveryMessageState), actor))).toBe('RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED');
    await packs.approveAttachment(context, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
    const ready = await repo.read(context, caseId);
    expect(ready.readiness).toMatchObject({ eligible: true, reason: null, caseRevision: OPENED, outstandingPence: 32000, packId: pack.id, packRevision: 1 });
    const state = await repo.preview(context, caseId, previewCommand(ready), actor);
    const view = state.latest!;
    expect(view).toMatchObject({ status: 'previewed', revision: 1, sequence: 1, changedSinceReview: false, approval: null, attempts: 0 });
    expect(view.message).toMatchObject({
      caseId, jobId: fixture.jobId, caseType: 'withheld_customer_payment', caseRevision: OPENED, amountPence: 32000, currency: 'GBP',
      sender: 'practice-builder@example.invalid', recipient: 'practice-customer@example.invalid', body: customerBody,
      packId: pack.id, packRevision: 1, manifestHash: pack.manifestHash, attachmentHash: pack.contentHash, sourceRefs: [fixture.invoiceId], policyVersion: 'practice-factual-message.v1',
    });
    expect(view.message.contentHash).toBe(buildRecoveryMessage(recoveryMessageSourceOf(view.message)).contentHash);
    expect(view.attachment).toMatchObject({ packId: pack.id, packRevision: 1, manifestHash: pack.manifestHash, contentHash: pack.contentHash });
    expect(view.attachment.sources.map(source => source.label)).toEqual(expect.arrayContaining(['Accepted quote immutable record', 'Customer invoice immutable record']));
    expect(kinds(view)).toEqual(['previewed']);
    expect(state).toMatchObject({ environment: 'synthetic_demo', realExternalActions: 0, sinkCount: 0, sink: [] });
    // Preview alone grants nothing: no Decision, no authorization, no outbox action, nothing in the sink.
    expect(await count('SELECT count(*) n FROM app.decision WHERE tenant_id=$1 AND subject_ref=$2', [fixture.tenantId, view.id])).toBe(0);
    expect(await count("SELECT count(*) n FROM app.action_outbox WHERE tenant_id=$1 AND provider_effect_key=$2", [fixture.tenantId, `recovery-message:${view.id}`])).toBe(0);
  });

  it.each([[1, '0.01'], [250000, '2,500.00'], [1_000_000_000_000, '10,000,000,000.00']])('states %i pence as £%s in the builder and in the database guard alike', async (claimPence, pounds) => {
    const { caseId } = await attached('withheld_customer_payment', claimPence);
    const state = await repo.preview(context, caseId, previewCommand(await repo.read(context, caseId)), actor);
    expect(state.latest!.message.amountPence).toBe(claimPence);
    expect(state.latest!.message.body).toBe(`Practice message — not sent. Our practice records show £${pounds} net remains in this case. Please review the attached example records.`);
  });

  it('uses supplier wording and a supplier recipient for a supplier correction', async () => {
    const { view } = await previewed('merchant_overcharge');
    expect(view.message).toMatchObject({ caseType: 'merchant_overcharge', recipient: 'practice-supplier@example.invalid', body: supplierBody });
    expect(view.attachment.sources.map(source => source.kind)).toEqual(expect.arrayContaining(['supplier_agreement', 'supplier_invoice', 'supplier_delivery']));
  });

  it('replays one command, conflicts on a changed payload and never reuses a command for another action', async () => {
    const { caseId } = await attached();
    const ready = await repo.read(context, caseId), command = previewCommand(ready);
    const first = await repo.preview(context, caseId, command, actor);
    expect(await repo.preview(context, caseId, command, actor)).toEqual(first);
    expect(await count('SELECT count(*) n FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2', [fixture.tenantId, caseId])).toBe(1);
    expect(await code(() => repo.preview(context, caseId, { ...command, expectedCaseRevision: OPENED + 1 }, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    // The same command id cannot be replayed as an approval, nor as a different case's preview.
    expect(await code(() => repo.command(context, caseId, { ...approveCommand(first.latest!), commandId: command.commandId }, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    const otherCase = (await attached()).caseId;
    expect(await code(() => repo.preview(context, otherCase, command, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
  });

  it('refuses a stale case revision or a pack that is not the current one, and writes nothing', async () => {
    const { caseId } = await attached();
    const ready = await repo.read(context, caseId);
    expect(await code(() => repo.preview(context, caseId, { ...previewCommand(ready), expectedCaseRevision: OPENED + 7 }, actor))).toBe('RECOVERY_MESSAGE_CHANGED');
    expect(await code(() => repo.preview(context, caseId, { ...previewCommand(ready), packId: randomUUID() }, actor))).toBe('RECOVERY_MESSAGE_CHANGED');
    expect(await count('SELECT count(*) n FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2', [fixture.tenantId, caseId])).toBe(0);
  });

  it('refuses a prevention case, an unknown case, another tenant, a non-owner and a revoked owner', async () => {
    const prevention = await newCase('prevention');
    expect(await code(() => repo.preview(context, prevention, { version: 'recovery-message-preview.v1', commandId: randomUUID(), expectedCaseRevision: 1, packId: randomUUID() }, actor))).toBe('RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE');
    expect(await code(() => repo.read(context, randomUUID()))).toBe('RECOVERY_MESSAGE_NOT_FOUND');
    const { caseId } = await attached(), ready = await repo.read(context, caseId);
    expect(await code(() => repo.read(otherContext, caseId))).toBe('RECOVERY_MESSAGE_NOT_FOUND');
    expect(await code(() => repo.preview(otherContext, caseId, previewCommand(ready), actor))).toBe('RECOVERY_MESSAGE_NOT_FOUND');
    for (const forbidden of [memberActor, revokedActor, { membershipId: randomUUID(), actorRef: 'membership:forged' }]) {
      expect(await code(() => repo.preview(context, caseId, previewCommand(ready), forbidden))).toBe('RECOVERY_MESSAGE_FORBIDDEN');
    }
    await expect(repo.read({} as VerifiedTenantContext, caseId)).rejects.toThrow('A verified tenant context');
    expect(await count('SELECT count(*) n FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2', [fixture.tenantId, caseId])).toBe(0);
  });

  it('treats any spelling of one case UUID as the same case', async () => {
    const { caseId } = await attached();
    const command = previewCommand(await repo.read(context, caseId));
    const first = await repo.preview(context, caseId.toUpperCase(), command, actor);
    expect(await repo.preview(context, caseId.toLowerCase(), command, actor)).toEqual(first);
    expect(await count('SELECT count(*) n FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2', [fixture.tenantId, caseId])).toBe(1);
  });

  it('marks a saved preview as changed when the case or its evidence moves on', async () => {
    const { caseId, view } = await previewed();
    expect(view.changedSinceReview).toBe(false);
    await cases.command(context, fixture.jobId, { version: 'recovery-case-command.v1', action: 'amend_claim', commandId: randomUUID(), caseId, claimedNetPence: 32100, reviewerRef: 'practice-owner', expectedRevision: OPENED  }, await reviewerOf());
    const after = await repo.read(context, caseId);
    expect(after.latest).toMatchObject({ id: view.id, changedSinceReview: true, status: 'previewed' });
    // The saved preview is immutable and still says what it said; approving it is refused.
    expect(after.latest!.message.body).toBe(customerBody);
    expect(await code(() => repo.command(context, caseId, approveCommand(after.latest!), actor))).toBe('RECOVERY_MESSAGE_CHANGED');
    expect(RECOVERY_MESSAGE_CHANGED).toBe('Review the changed message before approving');
  });
});

describe('approval is an exact Decision bound to the exact message hash', () => {
  it('refuses every changed field before anything is authorized', async () => {
    const { caseId, view } = await previewed();
    const exact = approveCommand(view);
    for (const change of [
      { recipient: 'practice-supplier@example.invalid' }, { body: `${customerBody} Pay today.` }, { amountPence: 32100 },
      { packId: randomUUID() }, { contentHash: 'f'.repeat(64) },
    ]) expect(await code(() => repo.command(context, caseId, { ...exact, commandId: randomUUID(), ...change }, actor)), JSON.stringify(change)).toBe('RECOVERY_MESSAGE_CHANGED');
    expect(await code(() => repo.command(context, caseId, { ...exact, commandId: randomUUID(), expectedRevision: 9 }, actor))).toBe('RECOVERY_MESSAGE_STALE_REVISION');
    expect(await code(() => repo.command(context, caseId, { ...exact, commandId: randomUUID(), messageId: randomUUID() }, actor))).toBe('RECOVERY_MESSAGE_NOT_FOUND');
    expect(await count('SELECT count(*) n FROM app.decision WHERE tenant_id=$1 AND subject_ref=$2', [fixture.tenantId, view.id])).toBe(0);
    expect(await count('SELECT count(*) n FROM app.command_receipt WHERE tenant_id=$1 AND semantic_key=$2', [fixture.tenantId, `recovery-message-approve:${view.id}`])).toBe(0);
  });

  it('creates exactly one Decision, authorization and durable outbox action carrying the approved bytes', async () => {
    const { caseId, view } = await previewed();
    const state = await repo.command(context, caseId, approveCommand(view), actor);
    const latest = state.latest!;
    expect(latest).toMatchObject({ status: 'queued', revision: 2, attempts: 0 });
    expect(kinds(latest)).toEqual(['previewed', 'approved']);
    expect(latest.approval).toMatchObject({ revoked: false });
    const { decisionId, authorizationId, outboxActionId } = latest.approval!;
    const decision = (await admin.query('SELECT * FROM app.decision WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, decisionId])).rows[0];
    expect(decision).toMatchObject({ subject_type: 'recovery_message', subject_ref: view.id, action_type: 'recovery.message.simulate' });
    expect((await admin.query('SELECT resolution,actor_membership_id FROM app.decision_resolution WHERE tenant_id=$1 AND decision_id=$2', [fixture.tenantId, decisionId])).rows).toEqual([{ resolution: 'approved', actor_membership_id: fixture.memberId }]);
    const authorization = (await admin.query('SELECT * FROM app.action_authorization WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, authorizationId])).rows[0];
    expect(authorization).toMatchObject({
      action_type: 'recovery.message.simulate', recipient: 'practice-customer@example.invalid', content_hash: view.message.contentHash,
      aggregate_revision: OPENED, currency: 'GBP', policy_version: 'practice-factual-message.v1', revoked_at: null, authorization_kind: 'exact',
    });
    expect(Number(authorization.amount_pence)).toBe(32000);
    const outbox = (await admin.query('SELECT * FROM app.action_outbox WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, outboxActionId])).rows[0];
    expect(outbox).toMatchObject({
      adapter: 'fake_recovery_message', status: 'pending', authorization_id: authorizationId, recipient: 'practice-customer@example.invalid',
      content_hash: view.message.contentHash, provider_effect_key: `recovery-message:${view.id}`, action_type: 'recovery.message.simulate',
    });
    expect(hash(outbox.immutable_content)).toBe(view.message.contentHash);
    expect(JSON.parse(outbox.immutable_content)).toMatchObject({ body: customerBody, attachmentHash: view.message.attachmentHash });
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(0);
    // Approval is not delivery.
    expect(await count('SELECT count(*) n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2', [fixture.tenantId, outboxActionId])).toBe(0);
  });

  it('replays one approval, collapses concurrent approvals to one effect, and refuses to approve twice', async () => {
    const { caseId, view } = await previewed();
    const command = approveCommand(view);
    const first = await repo.command(context, caseId, command, actor);
    expect(await repo.command(context, caseId, command, actor)).toEqual(first);
    expect(await code(() => repo.command(context, caseId, { ...command, amountPence: 32100 }, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    // A later approval of the same, already approved message is a typed stale-revision conflict, not a second effect.
    expect(await code(() => repo.command(context, caseId, approveCommand(view, randomUUID()), actor))).toBe('RECOVERY_MESSAGE_STALE_REVISION');
    const second = await previewed();
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => repo.command(context, second.caseId, approveCommand(second.view, randomUUID()), actor)));
    expect(results.filter(result => result.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    for (const result of results) if (result.status === 'rejected') expect((result.reason as { code: string }).code).toMatch(/^RECOVERY_MESSAGE_(STALE_REVISION|COMMAND_CONFLICT)$/u);
    expect(await count('SELECT count(*) n FROM app.recovery_message_approval WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, second.view.id])).toBe(1);
    expect(await count("SELECT count(*) n FROM app.action_outbox WHERE tenant_id=$1 AND provider_effect_key=$2", [fixture.tenantId, `recovery-message:${second.view.id}`])).toBe(1);
    expect(await count("SELECT count(*) n FROM app.decision WHERE tenant_id=$1 AND subject_ref=$2", [fixture.tenantId, second.view.id])).toBe(1);
  });

  it('rolls every approval write back when the evidence changed between preview and approval', async () => {
    const { caseId, view } = await previewed();
    await amend(caseId, 32200);
    // Rows get their own generated ids, so a leaked write is found by comparing the whole tenant's counts before and after.
    const before = await writeCounts();
    expect(await code(() => repo.command(context, caseId, approveCommand(view), actor))).toBe('RECOVERY_MESSAGE_CHANGED');
    expect(await writeCounts()).toEqual(before);
    expect(await count('SELECT count(*) n FROM app.decision WHERE tenant_id=$1 AND subject_ref=$2', [fixture.tenantId, view.id])).toBe(0);
    expect(await count("SELECT count(*) n FROM app.command_receipt WHERE tenant_id=$1 AND semantic_key=$2", [fixture.tenantId, `recovery-message-approve:${view.id}`])).toBe(0);
    expect(await count("SELECT count(*) n FROM app.action_outbox WHERE tenant_id=$1 AND provider_effect_key=$2", [fixture.tenantId, `recovery-message:${view.id}`])).toBe(0);
    expect(await count("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='recovery.message.approved'", [fixture.tenantId, view.id])).toBe(0);
  });

  it('counts exactly what an approval writes, so the rollback comparison can see a leaked write', async () => {
    const { caseId, view } = await previewed();
    const before = await writeCounts();
    await repo.command(context, caseId, approveCommand(view), actor);
    const after = await writeCounts();
    expect(after).toEqual({ ...before, decision: before.decision + 1, resolution: before.resolution + 1, authorization: before.authorization + 1, receipt: before.receipt + 1, outbox: before.outbox + 1, approval: before.approval + 1, event: before.event + 1, audit: before.audit + 2 });
  });

  it('refuses a superseded preview and a second live approval on the same case', async () => {
    const { caseId, view } = await previewed();
    const newer = await repo.preview(context, caseId, previewCommand(await repo.read(context, caseId)), actor);
    expect(newer.messages).toHaveLength(2);
    expect(await code(() => repo.command(context, caseId, approveCommand(view), actor))).toBe('RECOVERY_MESSAGE_CHANGED');
    const approvedState = await repo.command(context, caseId, approveCommand(newer.latest!), actor);
    expect(approvedState.latest!.status).toBe('queued');
    // Rejection is now earlier and stronger: the outstanding approval cannot be hidden by even a replacement preview.
    expect(await code(async () => repo.preview(context, caseId, previewCommand(await repo.read(context, caseId)), actor))).toBe('RECOVERY_MESSAGE_EXISTING_EFFECT');
  });

  it('refuses a non-owner, a revoked owner and an unknown actor at the command boundary', async () => {
    const { caseId, view } = await previewed();
    for (const forbidden of [memberActor, revokedActor, { membershipId: randomUUID(), actorRef: 'membership:forged' }]) {
      expect(await code(() => repo.command(context, caseId, approveCommand(view, randomUUID()), forbidden))).toBe('RECOVERY_MESSAGE_FORBIDDEN');
    }
    expect(await count('SELECT count(*) n FROM app.recovery_message_approval WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(0);
  });
});

describe('advancing the practice delivery', () => {
  it('delivers once to the practice sink with the approved body, hash, recipient and attachment', async () => {
    const { caseId, view } = await approved();
    const command = advanceCommand(view);
    const state = await repo.command(context, caseId, command, actor);
    const latest = state.latest!;
    expect(latest.status).toBe('simulated_delivery');
    expect(kinds(latest)).toEqual(['previewed', 'approved', 'started', 'succeeded']);
    expect(latest.attempts).toBe(1);
    expect(state.sinkCount).toBe(1);
    expect(state.sink).toEqual([expect.objectContaining({
      messageId: view.id, outboxActionId: latest.approval!.outboxActionId, recipient: 'practice-customer@example.invalid', body: customerBody,
      contentHash: view.message.contentHash, attachmentHash: view.message.attachmentHash, environment: 'synthetic_demo',
    })]);
    const row = (await admin.query('SELECT * FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).rows[0];
    expect(row.real_external_actions).toBe(0);
    expect((await admin.query('SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, latest.approval!.outboxActionId])).rows[0].status).toBe('succeeded');
    // Replaying the same command, or advancing again, changes nothing and creates no second effect.
    expect(await repo.command(context, caseId, command, actor)).toEqual(state);
    expect(await code(() => repo.command(context, caseId, advanceCommand(latest, 'success', randomUUID()), actor))).toBe('RECOVERY_MESSAGE_ALREADY_DELIVERED');
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(1);
    expect(await count('SELECT count(*) n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2', [fixture.tenantId, latest.approval!.outboxActionId])).toBe(1);
  });

  it('gives one effect or a typed stale-revision conflict when two clients advance together', async () => {
    const { caseId, view } = await approved();
    const results = await Promise.allSettled([repo.command(context, caseId, advanceCommand(view), actor), repo.command(context, caseId, advanceCommand(view), actor)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('RECOVERY_MESSAGE_STALE_REVISION');
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(1);
    expect((await viewOf(caseId)).status).toBe('simulated_delivery');
  });

  it('refuses to advance before approval and with a stale revision', async () => {
    const { caseId, view } = await previewed();
    expect(await code(() => repo.command(context, caseId, advanceCommand(view), actor))).toBe('RECOVERY_MESSAGE_NOT_APPROVED');
    const live = await approved();
    expect(await code(() => repo.command(context, live.caseId, { ...advanceCommand(live.view), expectedRevision: 1 }, actor))).toBe('RECOVERY_MESSAGE_STALE_REVISION');
  });

  it('delivers a supplier correction to the supplier recipient', async () => {
    const { caseId, view } = await approved('merchant_overcharge');
    const state = await repo.command(context, caseId, advanceCommand(view), actor);
    expect(state.latest!.status).toBe('simulated_delivery');
    expect(state.sink[0]).toMatchObject({ recipient: 'practice-supplier@example.invalid', body: supplierBody });
  });

  it('retries only a definite failure, never an unknown outcome', async () => {
    const { caseId, view } = await approved();
    const failed = await repo.command(context, caseId, advanceCommand(view, 'definite_failure'), actor);
    expect(failed.latest!.status).toBe('retryable');
    expect(kinds(failed.latest!)).toEqual(['previewed', 'approved', 'started', 'retryable']);
    expect(failed.sinkCount).toBe(0);
    const done = await repo.command(context, caseId, advanceCommand(failed.latest!), actor);
    expect(done.latest!.status).toBe('simulated_delivery');
    expect(done.latest!.attempts).toBe(2);
    expect(done.sinkCount).toBe(1);
  });
});

describe('an unknown outcome is checked, never blindly retried', () => {
  it('reports unknown, refuses to advance, then reconciles to the single provider record', async () => {
    const { caseId, view } = await approved('merchant_overcharge');
    const unknown = await repo.command(context, caseId, advanceCommand(view, 'response_lost'), actor);
    expect(unknown.latest!.status).toBe('outcome_unknown');
    // The practice provider did record it, but JobGuard does not know that yet.
    expect(unknown.sinkCount).toBe(1);
    expect(await code(() => repo.command(context, caseId, advanceCommand(unknown.latest!, 'success', randomUUID()), actor))).toBe('RECOVERY_MESSAGE_RECONCILE_REQUIRED');
    const done = await repo.command(context, caseId, simple('reconcile', unknown.latest!), actor);
    expect(done.latest!.status).toBe('simulated_delivery');
    expect(kinds(done.latest!)).toEqual(['previewed', 'approved', 'started', 'outcome_unknown', 'reconcile_started', 'reconciled']);
    expect(done.sinkCount).toBe(1);
    expect(await code(() => repo.command(context, caseId, simple('reconcile', done.latest!), actor))).toBe('RECOVERY_MESSAGE_NOT_RECONCILABLE');
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(1);
  });

  it('finds no provider record, then permits one safe retry and still ends with one sink row', async () => {
    const { caseId, view } = await approved();
    const unknown = await repo.command(context, caseId, advanceCommand(view, 'no_response'), actor);
    expect(unknown.latest!.status).toBe('outcome_unknown');
    expect(unknown.sinkCount).toBe(0);
    const checked = await repo.command(context, caseId, simple('reconcile', unknown.latest!), actor);
    expect(checked.latest!.status).toBe('retryable');
    expect(kinds(checked.latest!).slice(-2)).toEqual(['reconcile_started', 'retryable']);
    const done = await repo.command(context, caseId, advanceCommand(checked.latest!), actor);
    expect(done.latest!.status).toBe('simulated_delivery');
    expect(done.sinkCount).toBe(1);
  });

  it('refuses to reconcile a message that is not unknown, and a stale reconcile', async () => {
    const { caseId, view } = await approved();
    expect(await code(() => repo.command(context, caseId, simple('reconcile', view), actor))).toBe('RECOVERY_MESSAGE_NOT_RECONCILABLE');
    const unknown = await repo.command(context, caseId, advanceCommand(view, 'response_lost'), actor);
    expect(await code(() => repo.command(context, caseId, { ...simple('reconcile', unknown.latest!), expectedRevision: 1 }, actor))).toBe('RECOVERY_MESSAGE_STALE_REVISION');
  });
});

describe('revocation and changed evidence block execution', () => {
  it('blocks execution after the approval is revoked and records the revocation', async () => {
    const { caseId, view } = await approved();
    const revoked = await repo.command(context, caseId, simple('revoke', view), actor);
    expect(revoked.latest!.status).toBe('revoked');
    expect(revoked.latest!.approval!.revoked).toBe(true);
    expect(kinds(revoked.latest!)).toEqual(['previewed', 'approved', 'revoked']);
    const { authorizationId, outboxActionId } = revoked.latest!.approval!;
    expect((await admin.query('SELECT revoked_at FROM app.action_authorization WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, authorizationId])).rows[0].revoked_at).not.toBeNull();
    expect((await admin.query('SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, outboxActionId])).rows[0].status).toBe('cancelled');
    expect(await code(() => repo.command(context, caseId, advanceCommand(revoked.latest!), actor))).toBe('RECOVERY_MESSAGE_REVOKED');
    // Even the shared executor, called directly, refuses a revoked authorization.
    const executor = new ActionExecutor(runtime, new Map(), { emit: () => undefined });
    await executor.execute(context, outboxActionId);
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(0);
    expect(await count('SELECT count(*) n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2', [fixture.tenantId, outboxActionId])).toBe(0);
    expect(await code(() => repo.command(context, caseId, simple('revoke', revoked.latest!, randomUUID()), actor))).toBe('RECOVERY_MESSAGE_NOT_REVOCABLE');
  });

  it('blocks execution when the authorization was revoked outside the command', async () => {
    const { caseId, view } = await approved();
    await admin.query('UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, view.approval!.authorizationId]);
    expect(await code(() => repo.command(context, caseId, advanceCommand(view), actor))).toBe('RECOVERY_MESSAGE_BLOCKED');
    const after = await viewOf(caseId);
    expect(after.status).toBe('blocked');
    expect(kinds(after)).toEqual(['previewed', 'approved', 'blocked']);
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(0);
    expect(await count('SELECT count(*) n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2', [fixture.tenantId, view.approval!.outboxActionId])).toBe(0);
  });

  it('blocks execution when the approval has expired', async () => {
    const { caseId, view } = await approved();
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL session_replication_role='replica'");
      await client.query("UPDATE app.action_authorization SET expires_at=clock_timestamp()-interval '1 minute' WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, view.approval!.authorizationId]);
      await client.query('COMMIT');
    } finally { client.release(); }
    expect(await code(() => repo.command(context, caseId, advanceCommand(view), actor))).toBe('RECOVERY_MESSAGE_BLOCKED');
    expect((await viewOf(caseId)).status).toBe('blocked');
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(0);
  });

  it('blocks execution when the case or its evidence changed after approval', async () => {
    const { caseId, view } = await approved();
    await cases.command(context, fixture.jobId, { version: 'recovery-case-command.v1', action: 'amend_claim', commandId: randomUUID(), caseId, claimedNetPence: 32300, reviewerRef: 'practice-owner', expectedRevision: OPENED  }, await reviewerOf());
    expect((await viewOf(caseId)).changedSinceReview).toBe(true);
    expect(await code(() => repo.command(context, caseId, advanceCommand(view), actor))).toBe('RECOVERY_MESSAGE_BLOCKED');
    expect((await viewOf(caseId)).status).toBe('blocked');
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(0);
    expect((await admin.query('SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, view.approval!.outboxActionId])).rows[0].status).toBe('cancelled');
  });

  it('refuses to revoke a delivered or unknown-outcome message', async () => {
    const delivered = await approved();
    const done = await repo.command(context, delivered.caseId, advanceCommand(delivered.view), actor);
    expect(await code(() => repo.command(context, delivered.caseId, simple('revoke', done.latest!), actor))).toBe('RECOVERY_MESSAGE_NOT_REVOCABLE');
    const unknown = await approved();
    const state = await repo.command(context, unknown.caseId, advanceCommand(unknown.view, 'response_lost'), actor);
    expect(await code(() => repo.command(context, unknown.caseId, simple('revoke', state.latest!), actor))).toBe('RECOVERY_MESSAGE_NOT_REVOCABLE');
    const unapproved = await previewed();
    expect(await code(() => repo.command(context, unapproved.caseId, simple('revoke', unapproved.view), actor))).toBe('RECOVERY_MESSAGE_NOT_APPROVED');
  });
});

describe('raw runtime SQL stays fail-closed', () => {
  it('accepts a faithful preview row and refuses every forged one', async () => {
    const base = await rawBase();
    await insertPreview({}, base);
    const forged: Array<[string, Record<string, unknown>]> = [
      ['sequence collision', { sequence: 1 }],
      ['wrong outstanding amount', { sequence: 2, source: { amountPence: 32100 }, amount: 32100 }],
      ['wrong case revision', { sequence: 2, source: { caseRevision: OPENED + 5 }, caseRevision: OPENED + 5 }],
      ['real recipient', { sequence: 2, recipient: 'real.person@gmail.com' }],
      ['hash that is not the content', { sequence: 2, hash: 'e'.repeat(64) }],
      ['body column differs from the hashed content', { sequence: 2, body: 'Pay £9,000 by Friday or face court action.' }],
      ['stale pack revision', { sequence: 2, packRevision: 5, source: { packRevision: 5 } }],
    ];
    for (const [name, over] of forged) {
      const failure = await code(() => insertPreview(over, base));
      expect(failure, name).toMatch(/^(23514|23505|23503)$/u);
    }
    expect(await count('SELECT count(*) n FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2', [fixture.tenantId, base.caseId])).toBe(1);
  });

  it('refuses a message linked to a pack or approval from another case', async () => {
    const base = await rawBase(), other = await rawBase();
    expect(await code(() => insertPreview({ sequence: 1 }, { ...base, pack: other.pack }))).toMatch(/^(23503|23514)$/u);
    expect(await code(() => insertPreview({ sequence: 1 }, { ...base, approvalId: other.approvalId }))).toMatch(/^(23514|23503)$/u);
    // A same-tenant wrong-job link: the case belongs to the fixture job, not the unrelated one.
    expect(await code(() => insertPreview({ sequence: 1, jobId: fixture.otherJobId }, base))).toMatch(/^(23503|23514)$/u);
  });

  it('refuses a forged approval, and a forged sink row for an action that is not executing', async () => {
    const { caseId, view } = await approved();
    const otherPreview = await previewed();
    expect(await code(() => inTenant(query => query('INSERT INTO app.recovery_message_approval(tenant_id,job_id,case_id,message_id,authorization_id,outbox_action_id,environment) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [fixture.tenantId, fixture.jobId, otherPreview.caseId, otherPreview.view.id, randomUUID(), randomUUID(), 'synthetic_demo'])))).toMatch(/^(23503|23514)$/u);
    // An authorization that exists but was granted for a different message cannot be attached to this one.
    expect(await code(() => inTenant(query => query('INSERT INTO app.recovery_message_approval(tenant_id,job_id,case_id,message_id,authorization_id,outbox_action_id,environment) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [fixture.tenantId, fixture.jobId, otherPreview.caseId, otherPreview.view.id, view.approval!.authorizationId, view.approval!.outboxActionId, 'synthetic_demo'])))).toMatch(/^(23514|23505)$/u);
    expect(await code(() => inTenant(query => query(`INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'forged','synthetic_demo',0)`, [randomUUID(), fixture.tenantId, fixture.jobId, caseId, view.id, view.approval!.outboxActionId, view.message.recipient, view.message.body, view.message.contentHash, view.message.attachmentHash])))).toBe('23514');
    expect(await code(() => inTenant(query => query(`INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'forged','synthetic_demo',1)`, [randomUUID(), fixture.tenantId, fixture.jobId, caseId, view.id, view.approval!.outboxActionId, view.message.recipient, view.message.body, view.message.contentHash, view.message.attachmentHash])))).toBe('23514');
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(0);
  });

  it('allows a second sink row for neither the same message nor the same action', async () => {
    const { caseId, view } = await approved();
    const done = await repo.command(context, caseId, advanceCommand(view), actor);
    const insert = () => inTenant(query => query(`INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'again','synthetic_demo',0)`, [randomUUID(), fixture.tenantId, fixture.jobId, caseId, view.id, done.latest!.approval!.outboxActionId, view.message.recipient, view.message.body, view.message.contentHash, view.message.attachmentHash]));
    expect(await code(insert)).toMatch(/^(23505|23514)$/u);
    expect(await count('SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(1);
  });

  it('denies UPDATE, DELETE and TRUNCATE on every table, and keeps tenants and missing context apart', async () => {
    const { view } = await approved();
    const tables = ['recovery_message', 'recovery_message_approval', 'recovery_message_event', 'recovery_message_sink'];
    for (const table of tables) {
      expect(await code(() => inTenant(query => query(`UPDATE app.${table} SET environment='synthetic_demo'`))), `update ${table}`).toBe('42501');
      expect(await code(() => inTenant(query => query(`DELETE FROM app.${table}`))), `delete ${table}`).toBe('42501');
      expect(await code(() => runtime.query(`TRUNCATE app.${table}`)), `truncate ${table}`).toBe('42501');
    }
    const client = await runtime.connect();
    try {
      await client.query('RESET app.tenant_id');
      for (const table of tables) expect((await client.query(`SELECT * FROM app.${table}`)).rows, table).toEqual([]);
      // Revision 1 'previewed' satisfies the event guard, so it is row security that refuses the row.
      await expect(client.query(`INSERT INTO app.recovery_message_event(id,tenant_id,job_id,case_id,message_id,revision,kind,command_id,request_hash,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,1,'previewed',$6,$7,$8,'synthetic_demo')`,
        [randomUUID(), fixture.tenantId, fixture.jobId, view.message.caseId, view.id, randomUUID(), 'a'.repeat(64), fixture.memberId])).rejects.toMatchObject({ code: '42501' });
      await client.query('SELECT set_config($1,$2,false)', ['app.tenant_id', fixture.otherTenantId]);
      for (const table of tables) expect((await client.query(`SELECT * FROM app.${table}`)).rows, `other tenant ${table}`).toEqual([]);
      await expect(client.query(`INSERT INTO app.recovery_message_event(id,tenant_id,job_id,case_id,message_id,revision,kind,command_id,request_hash,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,1,'previewed',$6,$7,$8,'synthetic_demo')`,
        [randomUUID(), fixture.tenantId, fixture.jobId, view.message.caseId, view.id, randomUUID(), 'a'.repeat(64), fixture.memberId])).rejects.toMatchObject({ code: '42501' });
    } finally { await client.query('RESET app.tenant_id'); client.release(); }
  });

  it('refuses event gaps, an unknown kind and a first event that is not a preview', async () => {
    const { caseId, view } = await previewed();
    const insert = (revision: number, kind: string) => inTenant(query => query(`INSERT INTO app.recovery_message_event(id,tenant_id,job_id,case_id,message_id,revision,kind,command_id,request_hash,actor_membership_id,environment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic_demo')`,
      [randomUUID(), fixture.tenantId, fixture.jobId, caseId, view.id, revision, kind, randomUUID(), 'a'.repeat(64), fixture.memberId]));
    expect(await code(() => insert(5, 'approved'))).toBe('23514');
    expect(await code(() => insert(2, 'delivered_for_real'))).toBe('23514');
    expect(await code(() => insert(1, 'approved'))).toMatch(/^(23514|23505)$/u);
  });

  it('declares the four tables forced-RLS, migration-owned and runtime SELECT/INSERT only', async () => {
    const tables = ['recovery_message', 'recovery_message_approval', 'recovery_message_event', 'recovery_message_sink'];
    const catalog = (await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1) ORDER BY c.relname`, [tables])).rows;
    expect(catalog).toEqual(tables.map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true, owner: 'jobguard_migration' })));
    const grants = (await admin.query(`SELECT table_name::text AS table_name,array_agg(privilege_type::text ORDER BY privilege_type::text) privileges FROM information_schema.role_table_grants WHERE grantee='jobguard_runtime' AND table_schema='app' AND table_name=ANY($1) GROUP BY table_name ORDER BY table_name`, [tables])).rows;
    expect(grants).toEqual(tables.map(table_name => ({ table_name, privileges: ['INSERT', 'SELECT'] })));
    const definers = (await admin.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.prosecdef AND p.proname LIKE '%recovery_message%'`)).rows;
    expect(definers).toEqual([]);
  });
});

describe('audit and environment identity', () => {
  it('appends audit events for every step, with identifiers and hashes but no personal data', async () => {
    const { caseId, view } = await approved();
    const done = await repo.command(context, caseId, advanceCommand(view), actor);
    const events = (await admin.query("SELECT event_type,payload::text payload FROM app.audit_event WHERE tenant_id=$1 AND subject_type='recovery_message' AND subject_ref=$2 ORDER BY sequence", [fixture.tenantId, view.id])).rows;
    const types = events.map(event => event.event_type);
    expect(types).toEqual(expect.arrayContaining(['recovery.message.previewed', 'recovery.message.approved', 'recovery.message.started', 'recovery.message.succeeded']));
    for (const event of events) {
      expect(event.payload).not.toMatch(/@|example\.invalid|Practice message|£/u);
      expect(event.payload).not.toContain(customerBody);
    }
    expect(done.environment).toBe('synthetic_demo');
    expect(await count("SELECT count(*) n FROM app.recovery_message WHERE tenant_id=$1 AND environment<>'synthetic_demo'", [fixture.tenantId])).toBe(0);
  });
});

// ---- Round 2 repairs (Sol check of 5c9acb0): each block names the finding it closes -------------------------------

describe('the effect boundary re-checks the case, the evidence and the approver (P2-1)', () => {
  it('records nothing when the shared executor is called directly after the case changed', async () => {
    const { caseId, view } = await approved();
    await amend(caseId, 32400);
    await executorWith(practiceAdapter()).execute(context, view.approval!.outboxActionId);
    expect(await sinkCount(view.id)).toBe(0);
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('retryable');
    expect((await admin.query('SELECT error_code FROM app.action_attempt WHERE action_id=$1', [view.approval!.outboxActionId])).rows).toEqual([{ error_code: 'FAKE_BLOCKED_CHANGED' }]);
    // The next read closes the refusal as blocked (Codex P2 4197743212): it is never offered as "safe to try again", advancing it
    // cannot deliver, and a replacement can be previewed for the changed case.
    const state = await repo.read(context, caseId);
    expect(state.latest).toMatchObject({ status: 'blocked' });
    expect(state.latest!.history.at(-1)).toMatchObject({ kind: 'blocked' });
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('cancelled');
    expect(await code(() => repo.command(context, caseId, advanceCommand(state.latest!), actor))).toMatch(/^RECOVERY_MESSAGE_/);
    expect(await sinkCount(view.id)).toBe(0);
    // The closed action no longer counts as a live effect on the case, so it cannot block a replacement.
    expect((await admin.query("SELECT count(*)::int n FROM app.recovery_message_approval x JOIN app.action_outbox o ON (o.tenant_id,o.id)=(x.tenant_id,x.outbox_action_id) WHERE x.case_id=$1 AND o.status<>'cancelled'", [caseId])).rows[0].n).toBe(0);
  });

  it('records nothing when a proof was invalidated, although the case revision did not move', async () => {
    await inIsolatedWorld(async () => {
      const { caseId, view } = await approved();
      await admin.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'object_revoked')", [randomUUID(), fixture.tenantId, fixture.proofId, fixture.memberId]);
      expect((await repo.read(context, caseId)).latest).toMatchObject({ changedSinceReview: true });
      await executorWith(practiceAdapter()).execute(context, view.approval!.outboxActionId);
      expect(await sinkCount(view.id)).toBe(0);
      expect(await outboxStatus(view.approval!.outboxActionId)).toBe('retryable');
    });
  });

  it('records nothing when the approving member was revoked after the claim was taken', async () => {
    const owner = await makeMember('owner', false);
    const base = await previewed();
    const state = await repo.command(context, base.caseId, approveCommand(base.view), owner);
    const view = state.latest!;
    const holder = await admin.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [fixture.tenantId, base.caseId]);
      const running = executorWith(practiceAdapter()).execute(context, view.approval!.outboxActionId);
      await until(async () => (await outboxStatus(view.approval!.outboxActionId)) !== 'pending', 'the claim');
      await holder.query('UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1', [owner.membershipId]);
      await holder.query('COMMIT');
      await running;
    } finally { await holder.query('ROLLBACK').catch(() => undefined); holder.release(); }
    expect(await sinkCount(view.id)).toBe(0);
    // A revoked approver cannot leave it stranded as retryable: the next read closes it as blocked.
    expect((await repo.read(context, base.caseId)).latest).toMatchObject({ status: 'blocked' });
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('cancelled');
  });

  it('delivers once when nothing changed while the delivery waited for the case lock', async () => {
    const { caseId, view } = await approved();
    const holder = await admin.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [fixture.tenantId, caseId]);
      const running = executorWith(practiceAdapter()).execute(context, view.approval!.outboxActionId);
      await until(async () => (await outboxStatus(view.approval!.outboxActionId)) !== 'pending', 'the claim');
      expect(await sinkCount(view.id)).toBe(0); // the delivery is held at the effect boundary, not already written
      await holder.query('COMMIT');
      await running;
    } finally { await holder.query('ROLLBACK').catch(() => undefined); holder.release(); }
    expect(await sinkCount(view.id)).toBe(1);
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('succeeded');
  });

  it('catches a case change that lands between the claim and the sink insert', async () => {
    const { caseId, view } = await approved();
    const holder = await admin.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [fixture.tenantId, caseId]);
      const running = executorWith(practiceAdapter()).execute(context, view.approval!.outboxActionId);
      await until(async () => (await outboxStatus(view.approval!.outboxActionId)) !== 'pending', 'the claim');
      await holder.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,2,32400,'GBP','fixture-owner',$5)", [randomUUID(), fixture.tenantId, fixture.jobId, caseId, hash(randomUUID())]);
      await holder.query('COMMIT');
      await running;
    } finally { await holder.query('ROLLBACK').catch(() => undefined); holder.release(); }
    expect(await sinkCount(view.id)).toBe(0);
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('retryable');
  });

  it('refuses a raw sink row once the case, the pack, the proof set or the approver is no longer what was approved', async () => {
    const claimExecuting = (outboxId: string) => admin.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp() WHERE id=$1", [outboxId]);
    // Control: an untouched approved message whose action is executing accepts its own sink row.
    const ok = await approved();
    await claimExecuting(ok.view.approval!.outboxActionId);
    await rawSink(ok.caseId, ok.view);
    expect(await sinkCount(ok.view.id)).toBe(1);
    // The case amount moved.
    const moved = await approved();
    await claimExecuting(moved.view.approval!.outboxActionId);
    await amend(moved.caseId, 32500);
    expect(await code(() => rawSink(moved.caseId, moved.view)), 'case moved').toBe('23514');
    // A newer pack revision exists.
    const repacked = await approved();
    await claimExecuting(repacked.view.approval!.outboxActionId);
    await packs.generate(context, repacked.caseId, { commandId: randomUUID() }, actor.actorRef);
    expect(await code(() => rawSink(repacked.caseId, repacked.view)), 'pack rebuilt').toBe('23514');
    // The approving owner was revoked.
    const owner = await makeMember('owner', false), base = await previewed();
    const byOwner = (await repo.command(context, base.caseId, approveCommand(base.view), owner)).latest!;
    await claimExecuting(byOwner.approval!.outboxActionId);
    await admin.query('UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1', [owner.membershipId]);
    expect(await code(() => rawSink(base.caseId, byOwner)), 'approver revoked').toBe('23514');
    // The proof set changed (isolated: an invalidated proof would otherwise leak into every other test).
    await inIsolatedWorld(async () => {
      const proof = await approved();
      await claimExecuting(proof.view.approval!.outboxActionId);
      await admin.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'wrong_subject')", [randomUUID(), fixture.tenantId, fixture.proofId, fixture.memberId]);
      expect(await code(() => rawSink(proof.caseId, proof.view)), 'proof invalidated').toBe('23514');
    });
  });
});

describe('a new preview never hides an authorized action (P2-3)', () => {
  it('refuses another preview while an approved message is queued, retryable, unknown or delivered', async () => {
    for (const stage of ['queued', 'retryable', 'outcome_unknown', 'simulated_delivery'] as const) {
      const base = await approved();
      let state = base.state;
      if (stage === 'retryable') state = await repo.command(context, base.caseId, advanceCommand(base.view, 'definite_failure'), actor);
      if (stage === 'outcome_unknown') state = await repo.command(context, base.caseId, advanceCommand(base.view, 'response_lost'), actor);
      if (stage === 'simulated_delivery') state = await repo.command(context, base.caseId, advanceCommand(base.view, 'success'), actor);
      expect(state.latest!.status, stage).toBe(stage);
      const before = await count('SELECT count(*) n FROM app.recovery_message WHERE case_id=$1', [base.caseId]);
      expect(await code(() => repo.preview(context, base.caseId, previewCommand(state), actor)), stage).toBe('RECOVERY_MESSAGE_EXISTING_EFFECT');
      expect(await count('SELECT count(*) n FROM app.recovery_message WHERE case_id=$1', [base.caseId]), stage).toBe(before);
      const after = await repo.read(context, base.caseId);
      expect(after.latest, stage).toMatchObject({ id: base.view.id, status: stage });
      expect(after.messages, stage).toHaveLength(1);
    }
  });

  it('still previews a fresh message once the earlier approval was revoked or blocked', async () => {
    const revoked = await approved();
    const afterRevoke = await repo.command(context, revoked.caseId, simple('revoke', revoked.view), actor);
    const next = await repo.preview(context, revoked.caseId, previewCommand(afterRevoke), actor);
    expect(next.messages).toHaveLength(2);
    expect(next.latest).toMatchObject({ status: 'previewed', sequence: 2 });
    const blocked = await approved();
    await amend(blocked.caseId, 32600);
    expect(await code(() => repo.command(context, blocked.caseId, advanceCommand(blocked.view), actor))).toBe('RECOVERY_MESSAGE_BLOCKED');
    const newPack = await packs.generate(context, blocked.caseId, { commandId: randomUUID() }, actor.actorRef);
    await packs.approveAttachment(context, blocked.caseId, newPack.id, { commandId: randomUUID(), expectedManifestHash: newPack.manifestHash, expectedContentHash: newPack.contentHash }, actor.actorRef);
    const afterBlock = await repo.preview(context, blocked.caseId, previewCommand(await repo.read(context, blocked.caseId)), actor);
    expect(afterBlock.latest).toMatchObject({ status: 'previewed', sequence: 2 });
  });

  it('refuses a raw runtime preview row while an approved action is outstanding', async () => {
    const base = await approved();
    const approvalId = (await admin.query('SELECT id FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND pack_id=$2', [fixture.tenantId, base.pack.id])).rows[0].id as string;
    expect(await code(() => insertPreview({ sequence: 2 }, { ...base, approvalId }))).toBe('23514');
    expect(await count('SELECT count(*) n FROM app.recovery_message WHERE case_id=$1', [base.caseId])).toBe(1);
  });
});

describe('message content must be the canonical representation, field for field (P2-4)', () => {
  it('refuses missing, null, reordered, extra and non-JSON content even with a correct hash', async () => {
    const base = await rawBase();
    const good = buildRecoveryMessage({ caseId: base.caseId, jobId: fixture.jobId, caseType: 'withheld_customer_payment', caseRevision: OPENED, amountPence: 32000, sourceRefs: [fixture.invoiceId], packId: base.pack.id, packRevision: 1, manifestHash: base.pack.manifestHash, attachmentHash: base.pack.contentHash });
    const parsed = JSON.parse(good.immutableContent) as Record<string, unknown>;
    const without = (key: string) => { const { [key]: _gone, ...rest } = parsed; return JSON.stringify(rest); };
    const variants: Array<[string, string]> = [
      ['only the source references', JSON.stringify({ sourceRefs: [fixture.invoiceId] })],
      ['a required field removed', without('sender')],
      ['every column field removed but the references', without('body')],
      ['a null identifier', JSON.stringify({ ...parsed, caseId: null })],
      ['a null body', JSON.stringify({ ...parsed, body: null })],
      ['a number where a string belongs', JSON.stringify({ ...parsed, packRevision: '1' })],
      ['keys in another order', JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse()))],
      ['an extra key', JSON.stringify({ ...parsed, deadline: '7 days' })],
      ['pretty-printed whitespace', JSON.stringify(parsed, null, 1)],
      ['an escaped spelling of the same text', good.immutableContent.replace('£', '\\u00a3')],
      ['text that is not JSON', 'not json at all'],
    ];
    for (const [name, content] of variants) {
      expect(await code(() => insertPreview({ sequence: 1, content, hash: hash(content) }, base)), name).toBe('23514');
    }
    expect(await count('SELECT count(*) n FROM app.recovery_message WHERE case_id=$1', [base.caseId])).toBe(0);
    await insertPreview({ sequence: 1 }, base);
    expect(await count('SELECT count(*) n FROM app.recovery_message WHERE case_id=$1', [base.caseId])).toBe(1);
  });
});

describe('an interrupted recording is finished by the next touch (P2-5)', () => {
  const inject = async (table: 'recovery_message_event' | 'audit_event', column: 'kind' | 'event_type', value: string) => {
    await admin.query(`CREATE OR REPLACE FUNCTION public.injected_recording_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.${column}='${value}' THEN RAISE EXCEPTION 'INJECTED_RECORDING_FAULT' USING ERRCODE='XX000'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER zz_injected_recording_fault BEFORE INSERT ON app.${table} FOR EACH ROW EXECUTE FUNCTION public.injected_recording_fault()`);
    return () => admin.query(`DROP TRIGGER IF EXISTS zz_injected_recording_fault ON app.${table}`);
  };
  const failure = async (run: () => Promise<unknown>) => { try { await run(); } catch (error) { return (error as Error).message; } throw new Error('expected the call to fail'); };

  it('records a committed reconciliation result in the history when the first recording failed, on a read', async () => {
    const { caseId, view } = await approved();
    const unknown = await repo.command(context, caseId, advanceCommand(view, 'response_lost'), actor);
    const clear = await inject('recovery_message_event', 'kind', 'reconciled');
    try { expect(await failure(() => repo.command(context, caseId, simple('reconcile', unknown.latest!), actor))).toContain('INJECTED_RECORDING_FAULT'); } finally { await clear(); }
    // The practice provider's answer was committed to the outbox, but the history stopped at the check request.
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('succeeded');
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved', 'started', 'outcome_unknown', 'reconcile_started']);
    const healed = await repo.read(context, caseId);
    expect(healed.latest).toMatchObject({ status: 'simulated_delivery' });
    expect(kinds(healed.latest!)).toEqual(['previewed', 'approved', 'started', 'outcome_unknown', 'reconcile_started', 'reconciled']);
    expect(await auditTypes(view.id)).toContain('recovery.message.reconciled');
    expect(await sinkCount(view.id)).toBe(1);
  });

  it('finishes the same way when the identical command is replayed', async () => {
    const { caseId, view } = await approved();
    const unknown = await repo.command(context, caseId, advanceCommand(view, 'response_lost'), actor);
    const command = simple('reconcile', unknown.latest!);
    const clear = await inject('recovery_message_event', 'kind', 'reconciled');
    try { await failure(() => repo.command(context, caseId, command, actor)); } finally { await clear(); }
    const replayed = await repo.command(context, caseId, command, actor);
    expect(kinds(replayed.latest!)).toEqual(['previewed', 'approved', 'started', 'outcome_unknown', 'reconcile_started', 'reconciled']);
    expect(await count("SELECT count(*) n FROM app.recovery_message_event WHERE message_id=$1 AND kind='reconciled'", [view.id])).toBe(1);
  });

  it('finishes an interrupted delivery recording, on a replay of the advance command', async () => {
    const { caseId, view } = await approved();
    const command = advanceCommand(view);
    const clear = await inject('recovery_message_event', 'kind', 'succeeded');
    try { await failure(() => repo.command(context, caseId, command, actor)); } finally { await clear(); }
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('succeeded');
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved', 'started']);
    const replayed = await repo.command(context, caseId, command, actor);
    expect(kinds(replayed.latest!)).toEqual(['previewed', 'approved', 'started', 'succeeded']);
    expect(replayed.latest!.status).toBe('simulated_delivery');
    expect(await sinkCount(view.id)).toBe(1);
    expect(await attemptCount(view.approval!.outboxActionId)).toBe(1);
  });

  it('writes a terminal event and its audit record together or not at all', async () => {
    const { caseId, view } = await approved();
    const clear = await inject('audit_event', 'event_type', 'recovery.message.succeeded');
    try { await failure(() => repo.command(context, caseId, advanceCommand(view), actor)); } finally { await clear(); }
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved', 'started']);
    expect(await auditTypes(view.id)).not.toContain('recovery.message.succeeded');
    await repo.read(context, caseId);
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved', 'started', 'succeeded']);
    expect((await auditTypes(view.id)).filter(type => type === 'recovery.message.succeeded')).toHaveLength(1);
  });

  it('records what a worker-driven delivery did, from the attempt and sink facts, exactly once', async () => {
    const { caseId, view } = await approved();
    await executorWith(practiceAdapter()).execute(context, view.approval!.outboxActionId);
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved']); // nothing recorded the delivery yet
    const [first, second] = [await repo.read(context, caseId), await repo.read(context, caseId)];
    expect(kinds(first.latest!)).toEqual(['previewed', 'approved', 'started', 'succeeded']);
    expect(second.latest!.history).toEqual(first.latest!.history);
    expect(first.latest).toMatchObject({ status: 'simulated_delivery', attempts: 1 });
    expect(await auditTypes(view.id)).toEqual(expect.arrayContaining(['recovery.message.started', 'recovery.message.succeeded']));
    // The worker did the delivery, so the reconstructed facts name the executor; the approver stays only as the authorisation (AGENTS.md:123).
    const audits = (await admin.query("SELECT event_type,actor_ref,payload FROM app.audit_event WHERE subject_type='recovery_message' AND subject_ref=$1 ORDER BY sequence", [view.id])).rows;
    expect(audits.find(row => row.event_type === 'recovery.message.approved')!.actor_ref).toBe(`membership:${actor.membershipId}`);
    for (const type of ['recovery.message.started', 'recovery.message.succeeded']) {
      const row = audits.find(audit => audit.event_type === type)!;
      expect(row.actor_ref).toBe('system:recovery-message-executor');
      expect(row.payload.references.authorisedBy).toBe(`membership:${actor.membershipId}`);
    }
    const unknown = await approved();
    await executorWith(practiceAdapter('response_lost')).execute(context, unknown.view.approval!.outboxActionId);
    expect(kinds((await repo.read(context, unknown.caseId)).latest!)).toEqual(['previewed', 'approved', 'started', 'outcome_unknown']);
  });
});

describe('an abandoned delivery can be checked and recovered through the application (P2-6)', () => {
  const crashing = (afterRecording = false): OutboundAdapter => ({
    name: 'fake_recovery_message', supportsProviderDeduplication: true,
    deliver: async action => { if (afterRecording) await practiceAdapter().deliver(action); throw new Error('PROCESS_DIED'); },
    reconcile: async () => 'unknown',
  });
  const age = (outboxId: string) => admin.query("UPDATE app.action_outbox SET claimed_at=clock_timestamp()-interval '10 minutes' WHERE id=$1", [outboxId]);

  it('shows a fresh claim as in progress and an elapsed one as an unknown outcome, and checks it without resending', async () => {
    const { caseId, view } = await approved();
    const outboxId = view.approval!.outboxActionId;
    await expect(executorWith(crashing()).execute(context, outboxId)).rejects.toThrow('PROCESS_DIED');
    let state = await repo.read(context, caseId);
    expect(state.latest).toMatchObject({ status: 'executing', claimAbandoned: false });
    expect(await code(() => repo.command(context, caseId, advanceCommand(state.latest!), actor))).toBe('RECOVERY_MESSAGE_EXECUTION_PENDING');
    expect(await code(() => repo.command(context, caseId, simple('reconcile', state.latest!), actor))).toBe('RECOVERY_MESSAGE_NOT_RECONCILABLE');
    await age(outboxId);
    state = await repo.read(context, caseId); // a reload
    expect(state.latest).toMatchObject({ status: 'outcome_unknown', claimAbandoned: true });
    expect(await code(() => repo.command(context, caseId, advanceCommand(state.latest!), actor))).toBe('RECOVERY_MESSAGE_RECONCILE_REQUIRED');
    expect(await sinkCount(view.id)).toBe(0);
    const checked = await repo.command(context, caseId, simple('reconcile', state.latest!), actor);
    // Nothing was recorded by the practice provider, so one safe retry is offered and the uncertainty is in the history.
    expect(checked.latest).toMatchObject({ status: 'retryable', claimAbandoned: false });
    expect(kinds(checked.latest!)).toEqual(['previewed', 'approved', 'started', 'outcome_unknown', 'reconcile_started', 'retryable']);
    expect(checked.sinkCount).toBe(0);
    const delivered = await repo.command(context, caseId, advanceCommand(checked.latest!), actor);
    expect(delivered.latest).toMatchObject({ status: 'simulated_delivery', attempts: 2 });
    expect(await sinkCount(view.id)).toBe(1);
  });

  it('finds the provider record of an abandoned delivery that had already been written, and never sends again', async () => {
    const { caseId, view } = await approved();
    const outboxId = view.approval!.outboxActionId;
    await expect(executorWith(crashing(true)).execute(context, outboxId)).rejects.toThrow('PROCESS_DIED');
    await age(outboxId);
    const state = await repo.read(context, caseId);
    expect(state.latest).toMatchObject({ status: 'outcome_unknown', claimAbandoned: true });
    const checked = await repo.command(context, caseId, simple('reconcile', state.latest!), actor);
    expect(checked.latest).toMatchObject({ status: 'simulated_delivery', attempts: 1 });
    expect(kinds(checked.latest!)).toEqual(['previewed', 'approved', 'started', 'outcome_unknown', 'reconcile_started', 'reconciled']);
    expect(await sinkCount(view.id)).toBe(1);
    expect(await attemptCount(outboxId)).toBe(1);
  });

  it('recovers through the application when the practice process stops mid-delivery', async () => {
    const { caseId, view } = await approved();
    expect(await code(() => repo.command(context, caseId, advanceCommand(view, 'process_stopped'), actor))).toBe('RECOVERY_MESSAGE_DELIVERY_INTERRUPTED');
    const interrupted = await repo.read(context, caseId);
    expect(interrupted.latest).toMatchObject({ status: 'executing', claimAbandoned: false });
    expect(kinds(interrupted.latest!)).toEqual(['previewed', 'approved', 'started']);
    await age(view.approval!.outboxActionId);
    const unknown = (await repo.read(context, caseId)).latest!;
    expect(unknown).toMatchObject({ status: 'outcome_unknown', claimAbandoned: true });
    const checked = await repo.command(context, caseId, simple('reconcile', unknown), actor);
    expect(checked.latest!.status).toBe('retryable');
    expect(checked.sinkCount).toBe(0);
  });
});

describe('a fresh check finishes an abandoned reconcile without resending (round 8, Opus P2-1)', () => {
  const failure = async (run: () => Promise<unknown>) => { try { await run(); } catch (error) { return (error as Error).message; } throw new Error('expected the call to fail'); };
  /** The practice-provider check dies after `reconcile_started` committed: a fault on the outbox answer that the check records. */
  const failOutboxAnswer = async () => {
    await admin.query(`CREATE OR REPLACE FUNCTION public.injected_outbox_answer_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status='outcome_unknown' AND NEW.status IN ('succeeded','retryable') THEN RAISE EXCEPTION 'INJECTED_OUTBOX_ANSWER_FAULT' USING ERRCODE='XX000'; END IF; RETURN NEW; END $$`);
    await admin.query('CREATE TRIGGER zz_injected_outbox_answer_fault BEFORE UPDATE ON app.action_outbox FOR EACH ROW EXECUTE FUNCTION public.injected_outbox_answer_fault()');
    return () => admin.query('DROP TRIGGER IF EXISTS zz_injected_outbox_answer_fault ON app.action_outbox');
  };
  /** Makes the newest check start older than the five-minute window that already marks an executing claim as abandoned. */
  const ageCheck = (messageId: string) => admin.query(
    "UPDATE app.recovery_message_event SET created_at=clock_timestamp()-interval '10 minutes' WHERE message_id=$1 AND revision=(SELECT max(revision) FROM app.recovery_message_event WHERE message_id=$1)", [messageId]);
  const receipts = (commandId: string) => count('SELECT count(*) n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2', [fixture.tenantId, commandId]);
  const eventCount = (messageId: string, kind: string) => count('SELECT count(*) n FROM app.recovery_message_event WHERE message_id=$1 AND kind=$2', [messageId, kind]);
  const auditCount = (messageId: string, type: string) => count("SELECT count(*) n FROM app.audit_event WHERE subject_type='recovery_message' AND subject_ref=$1 AND event_type=$2", [messageId, type]);
  const UNKNOWN = ['previewed', 'approved', 'started', 'outcome_unknown'];
  /** An unknown outcome whose first check committed `reconcile_started` and then failed before recording the provider's answer. */
  async function abandonedCheck(outcome: 'response_lost' | 'no_response') {
    const base = await approved();
    const unknown = await repo.command(context, base.caseId, advanceCommand(base.view, outcome), actor);
    const original = simple('reconcile', unknown.latest!);
    const clear = await failOutboxAnswer();
    try { expect(await failure(() => repo.command(context, base.caseId, original, actor))).toContain('INJECTED_OUTBOX_ANSWER_FAULT'); } finally { await clear(); }
    const outboxId = base.view.approval!.outboxActionId;
    expect(await outboxStatus(outboxId)).toBe('outcome_unknown');
    expect(await storedKinds(base.view.id)).toEqual([...UNKNOWN, 'reconcile_started']);
    return { ...base, outboxId, original, stuck: (await repo.read(context, base.caseId)).latest! };
  }

  it('refuses a fresh check inside the window, then lets one take over, finish and record the answer exactly once', async () => {
    const { caseId, view, outboxId, original, stuck } = await abandonedCheck('response_lost');
    expect(stuck).toMatchObject({ status: 'outcome_unknown', attempts: 1 });
    // A check that began moments ago may still be running: a fresh click is refused and leaves nothing behind.
    const before = await writeCounts();
    for (let click = 0; click < 2; click++) {
      const fresh = simple('reconcile', stuck);
      expect(await code(() => repo.command(context, caseId, fresh, actor))).toBe('RECOVERY_MESSAGE_EXECUTION_PENDING');
      expect(await receipts(fresh.commandId)).toBe(0);
    }
    expect(await writeCounts()).toEqual(before);
    expect(await storedKinds(view.id)).toEqual([...UNKNOWN, 'reconcile_started']);
    // Past the window that already marks an executing claim abandoned, a fresh command id from a reloaded browser finishes it.
    await ageCheck(view.id);
    const reloaded = (await repo.read(context, caseId)).latest!;
    expect(reloaded).toMatchObject({ status: 'outcome_unknown', revision: stuck.revision });
    const fresh = simple('reconcile', reloaded);
    const done = await repo.command(context, caseId, fresh, actor);
    expect(done.latest).toMatchObject({ status: 'simulated_delivery', attempts: 1 });
    const finished = [...UNKNOWN, 'reconcile_started', 'outcome_unknown', 'reconcile_started', 'reconciled'];
    expect(kinds(done.latest!)).toEqual(finished);
    expect(await storedKinds(view.id)).toEqual(finished);
    expect(await outboxStatus(outboxId)).toBe('succeeded');
    // Exactly one answer, one audit record for it, one provider record, and no second delivery attempt.
    expect(await eventCount(view.id, 'reconciled')).toBe(1);
    expect(await auditCount(view.id, 'recovery.message.reconciled')).toBe(1);
    expect(await auditCount(view.id, 'recovery.message.reconcile_started')).toBe(2);
    expect(await sinkCount(view.id)).toBe(1);
    expect(await attemptCount(outboxId)).toBe(1);
    // Replays of the abandoned original and of the takeover both return the settled state and record nothing more.
    const settled = await writeCounts();
    expect(await repo.command(context, caseId, original, actor)).toEqual(done);
    expect(await repo.command(context, caseId, fresh, actor)).toEqual(done);
    expect(await writeCounts()).toEqual(settled);
    // The message is no longer stuck.
    expect(await code(() => repo.command(context, caseId, simple('reconcile', done.latest!), actor))).toBe('RECOVERY_MESSAGE_NOT_RECONCILABLE');
  });

  it('finds no provider record after a takeover, offers one safe retry and never resends by itself', async () => {
    const { caseId, view, outboxId, stuck } = await abandonedCheck('no_response');
    await ageCheck(view.id);
    const checked = await repo.command(context, caseId, simple('reconcile', stuck), actor);
    expect(checked.latest).toMatchObject({ status: 'retryable', attempts: 1 });
    expect(kinds(checked.latest!)).toEqual([...UNKNOWN, 'reconcile_started', 'outcome_unknown', 'reconcile_started', 'retryable']);
    expect(await eventCount(view.id, 'retryable')).toBe(1);
    expect(await auditCount(view.id, 'recovery.message.retryable')).toBe(1);
    expect(checked.sinkCount).toBe(0);
    expect(await attemptCount(outboxId)).toBe(1);
    const delivered = await repo.command(context, caseId, advanceCommand(checked.latest!), actor);
    expect(delivered.latest).toMatchObject({ status: 'simulated_delivery', attempts: 2 });
    expect(delivered.sinkCount).toBe(1);
  });

  it('still lets the original command id resume its own check inside the window, with no takeover recorded', async () => {
    const { caseId, view, outboxId, original } = await abandonedCheck('response_lost');
    const resumed = await repo.command(context, caseId, original, actor);
    expect(resumed.latest!.status).toBe('simulated_delivery');
    expect(kinds(resumed.latest!)).toEqual([...UNKNOWN, 'reconcile_started', 'reconciled']);
    expect(await eventCount(view.id, 'reconciled')).toBe(1);
    expect(await sinkCount(view.id)).toBe(1);
    expect(await attemptCount(outboxId)).toBe(1);
  });

  it('lets a takeover that itself failed be resumed by its own id, and refuses a fresh id while it is recent', async () => {
    const { caseId, view, stuck } = await abandonedCheck('response_lost');
    await ageCheck(view.id);
    const takeover = simple('reconcile', stuck);
    const clear = await failOutboxAnswer();
    try { expect(await failure(() => repo.command(context, caseId, takeover, actor))).toContain('INJECTED_OUTBOX_ANSWER_FAULT'); } finally { await clear(); }
    expect(await storedKinds(view.id)).toEqual([...UNKNOWN, 'reconcile_started', 'outcome_unknown', 'reconcile_started']);
    const recent = (await repo.read(context, caseId)).latest!;
    const fresh = simple('reconcile', recent);
    expect(await code(() => repo.command(context, caseId, fresh, actor))).toBe('RECOVERY_MESSAGE_EXECUTION_PENDING');
    expect(await receipts(fresh.commandId)).toBe(0);
    const resumed = await repo.command(context, caseId, takeover, actor);
    expect(kinds(resumed.latest!)).toEqual([...UNKNOWN, 'reconcile_started', 'outcome_unknown', 'reconcile_started', 'reconciled']);
    expect(await eventCount(view.id, 'reconciled')).toBe(1);
    expect(await sinkCount(view.id)).toBe(1);
  });

  it('lets a later fresh check take over again when the first takeover is also abandoned', async () => {
    const { caseId, view, outboxId, stuck } = await abandonedCheck('no_response');
    await ageCheck(view.id);
    const clear = await failOutboxAnswer();
    try { expect(await failure(() => repo.command(context, caseId, simple('reconcile', stuck), actor))).toContain('INJECTED_OUTBOX_ANSWER_FAULT'); } finally { await clear(); }
    await ageCheck(view.id);
    const again = (await repo.read(context, caseId)).latest!;
    const checked = await repo.command(context, caseId, simple('reconcile', again), actor);
    expect(checked.latest!.status).toBe('retryable');
    expect(kinds(checked.latest!)).toEqual([...UNKNOWN, 'reconcile_started', 'outcome_unknown', 'reconcile_started', 'outcome_unknown', 'reconcile_started', 'retryable']);
    expect(await eventCount(view.id, 'retryable')).toBe(1);
    expect(await attemptCount(outboxId)).toBe(1);
    expect(checked.sinkCount).toBe(0);
  });

  it('also takes over an abandoned check that began from an abandoned delivery claim', async () => {
    const { caseId, view } = await approved();
    const outboxId = view.approval!.outboxActionId;
    const dying: OutboundAdapter = { name: 'fake_recovery_message', supportsProviderDeduplication: true, deliver: async () => { throw new Error('PROCESS_DIED'); }, reconcile: async () => 'unknown' };
    await expect(executorWith(dying).execute(context, outboxId)).rejects.toThrow('PROCESS_DIED');
    await admin.query("UPDATE app.action_outbox SET claimed_at=clock_timestamp()-interval '10 minutes' WHERE id=$1", [outboxId]);
    const unknown = (await repo.read(context, caseId)).latest!;
    expect(unknown).toMatchObject({ status: 'outcome_unknown', claimAbandoned: true });
    const clear = await failOutboxAnswer();
    try { expect(await failure(() => repo.command(context, caseId, simple('reconcile', unknown), actor))).toContain('INJECTED_OUTBOX_ANSWER_FAULT'); } finally { await clear(); }
    expect(await storedKinds(view.id)).toEqual([...UNKNOWN, 'reconcile_started']);
    expect(await code(async () => repo.command(context, caseId, simple('reconcile', (await repo.read(context, caseId)).latest!), actor))).toBe('RECOVERY_MESSAGE_EXECUTION_PENDING');
    await ageCheck(view.id);
    const checked = await repo.command(context, caseId, simple('reconcile', (await repo.read(context, caseId)).latest!), actor);
    expect(checked.latest!.status).toBe('retryable');
    expect(kinds(checked.latest!)).toEqual([...UNKNOWN, 'reconcile_started', 'outcome_unknown', 'reconcile_started', 'retryable']);
    expect(await attemptCount(outboxId)).toBe(1);
    expect(checked.sinkCount).toBe(0);
  });

  it('lets exactly one of two simultaneous fresh checks take over', async () => {
    const { caseId, view, outboxId, stuck } = await abandonedCheck('response_lost');
    await ageCheck(view.id);
    const settled = await Promise.allSettled([repo.command(context, caseId, simple('reconcile', stuck), actor), repo.command(context, caseId, simple('reconcile', stuck), actor)]);
    expect(settled.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = settled.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as { code?: string }).code).toBe('RECOVERY_MESSAGE_STALE_REVISION');
    expect(await storedKinds(view.id)).toEqual([...UNKNOWN, 'reconcile_started', 'outcome_unknown', 'reconcile_started', 'reconciled']);
    expect(await eventCount(view.id, 'reconciled')).toBe(1);
    expect(await auditCount(view.id, 'recovery.message.reconciled')).toBe(1);
    expect(await sinkCount(view.id)).toBe(1);
    expect(await attemptCount(outboxId)).toBe(1);
  });
});

describe('history cannot be forged under the runtime role (P2-7)', () => {
  const everyKind = ['approved', 'revoked', 'started', 'succeeded', 'retryable', 'failed', 'outcome_unknown', 'reconcile_started', 'reconciled', 'blocked'];

  it('refuses every consequential kind on a message nobody approved', async () => {
    const { caseId, view } = await previewed();
    for (const kind of everyKind) expect(await code(() => rawEvent(caseId, view.id, 2, kind)), `${kind} on a preview`).toBe('23514');
    expect(await storedKinds(view.id)).toEqual(['previewed']);
  });

  it('refuses kinds that no authorization, attempt, sink record or outcome supports on an approved message', async () => {
    const { caseId, view } = await approved();
    for (const kind of ['approved', 'succeeded', 'retryable', 'failed', 'outcome_unknown', 'reconcile_started', 'reconciled', 'revoked', 'blocked']) {
      expect(await code(() => rawEvent(caseId, view.id, 3, kind)), `${kind} on a queued message`).toBe('23514');
    }
    expect(await storedKinds(view.id)).toEqual(['previewed', 'approved']);
  });

  it('refuses a forged outcome after a start that no delivery attempt followed, and after a real delivery', async () => {
    const { caseId, view } = await approved();
    await rawEvent(caseId, view.id, 3, 'started'); // a start backed by a live authorization on a queued action is a valid claim intent
    for (const kind of ['succeeded', 'retryable', 'outcome_unknown', 'failed', 'reconciled', 'blocked']) {
      expect(await code(() => rawEvent(caseId, view.id, 4, kind)), `${kind} with no attempt`).toBe('23514');
    }
    const delivered = await approved();
    await repo.command(context, delivered.caseId, advanceCommand(delivered.view), actor);
    const revision = (await viewOf(delivered.caseId)).revision;
    for (const kind of everyKind) expect(await code(() => rawEvent(delivered.caseId, delivered.view.id, revision + 1, kind)), `${kind} after delivery`).toBe('23514');
  });

  it('refuses a reconciliation or a retry that the outbox does not show, and a forged revocation or block', async () => {
    const unknown = await approved();
    const state = await repo.command(context, unknown.caseId, advanceCommand(unknown.view, 'no_response'), actor);
    const next = state.latest!.revision + 1;
    expect(await code(() => rawEvent(unknown.caseId, unknown.view.id, next, 'reconciled'))).toBe('23514'); // no sink record, outbox still unknown
    expect(await code(() => rawEvent(unknown.caseId, unknown.view.id, next, 'retryable'))).toBe('23514');
    expect(await code(() => rawEvent(unknown.caseId, unknown.view.id, next, 'succeeded'))).toBe('23514');
    expect(await code(() => rawEvent(unknown.caseId, unknown.view.id, next, 'revoked'))).toBe('23514');
    expect(await code(() => rawEvent(unknown.caseId, unknown.view.id, next, 'blocked'))).toBe('23514');
    await rawEvent(unknown.caseId, unknown.view.id, next, 'reconcile_started'); // the outbox really is unknown: a check may start
    expect((await storedKinds(unknown.view.id)).at(-1)).toBe('reconcile_started');
  });

  it('accepts a start backed by a live approval and finishes an orphaned start with one delivery', async () => {
    const { caseId, view } = await approved();
    await rawEvent(caseId, view.id, 3, 'started');
    const done = await repo.command(context, caseId, advanceCommand({ ...view, revision: 3 }), actor);
    expect(done.latest!.status).toBe('simulated_delivery');
    expect(kinds(done.latest!)).toEqual(['previewed', 'approved', 'started', 'started', 'succeeded']);
    expect(await sinkCount(view.id)).toBe(1);
  });
});

// These races exercise the real guards; the two connections never mock authoritative data.
describe('source writes serialize with the final effect check (P2-1)', () => {
  it('an invalidation committed after validation but before insertion prevents the sink effect', async () => {
    await inIsolatedWorld(async () => {
      const { caseId, view } = await approved();
      const holder = await admin.connect();
      try {
        await holder.query('BEGIN');
        await holder.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext('recovery-message-sources'))", [fixture.tenantId]);
        const running = executorWith(practiceAdapter()).execute(context, view.approval!.outboxActionId);
        await until(async () => await outboxStatus(view.approval!.outboxActionId) === 'executing', 'the executing claim');
        await holder.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'object_revoked')", [randomUUID(), fixture.tenantId, fixture.proofId, fixture.memberId]);
        await holder.query('COMMIT'); await running;
      } finally { await holder.query('ROLLBACK').catch(() => undefined); holder.release(); }
      expect(await sinkCount(view.id)).toBe(0);
    });
  });
  it('a source invalidation waits for a sink transaction that already holds the effect lock', async () => {
    await inIsolatedWorld(async () => {
      const { caseId, view } = await approved();
      await admin.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp() WHERE id=$1", [view.approval!.outboxActionId]);
      const sink = await runtime.connect(), writer = await runtime.connect();
      try {
        await sink.query('BEGIN'); await sink.query("SELECT set_config('app.tenant_id',$1,true)", [fixture.tenantId]);
        await sink.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [fixture.tenantId, caseId]);
        await sink.query("SELECT app.lock_recovery_message_sources($1)", [fixture.tenantId]);
        await writer.query('BEGIN'); await writer.query("SELECT set_config('app.tenant_id',$1,true)", [fixture.tenantId]);
        let completed = false;
        const invalidation = writer.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'object_revoked')", [randomUUID(), fixture.tenantId, fixture.proofId, fixture.memberId]).then(() => { completed = true; });
        await until(async () => (await admin.query("SELECT 1 FROM pg_stat_activity WHERE query LIKE 'INSERT INTO app.evidence_invalidation%' AND wait_event='advisory'")).rowCount !== 0, 'source writer held at the effect boundary');
        expect(completed).toBe(false);
        await sink.query(`INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'locked','synthetic_demo',0)`, [randomUUID(), fixture.tenantId, fixture.jobId, caseId, view.id, view.approval!.outboxActionId, view.message.recipient, view.message.body, view.message.contentHash, view.message.attachmentHash]);
        await sink.query('COMMIT'); await invalidation; await writer.query('COMMIT');
        expect(await sinkCount(view.id)).toBe(1);
      } finally { await sink.query('ROLLBACK').catch(() => undefined); await writer.query('ROLLBACK').catch(() => undefined); sink.release(); writer.release(); }
    });
  });
  it('a raw sink cannot use an old pack when supplier source validity changed', async () => {
    await inIsolatedWorld(async () => {
      const { caseId, view } = await approved('merchant_overcharge');
      await admin.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp() WHERE id=$1", [view.approval!.outboxActionId]);
      await admin.query("UPDATE app.supplier_document SET status='held' WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, fixture.supplierInvoiceId]);
      expect(await code(() => rawSink(caseId, view))).toBe('23514');
      expect(await sinkCount(view.id)).toBe(0);
    });
  });
});

describe('the saved attachment keeps exact historical sources (P3-10)', () => {
  it('preserves source bytes, identities and hashes when a proof is invalidated and a later pack omits it', async () => {
    await inIsolatedWorld(async () => {
      const { caseId, view } = await approved();
      const savedProof = view.attachment.sources.find(source => source.sourceId === `evidence_object:${fixture.proofId}`)!;
      expect(savedProof.content).toBeTruthy(); expect(savedProof.contentHash).toBe(hash(savedProof.content));
      await admin.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'object_revoked')", [randomUUID(), fixture.tenantId, fixture.proofId, fixture.memberId]);
      const rebuilt = await packs.generate(context, caseId, { commandId: randomUUID() }, actor.actorRef);
      expect(rebuilt.sources.map(source => source.sourceId)).not.toContain(savedProof.sourceId);
      const reloaded = await repo.read(context, caseId);
      expect(reloaded.latest!.attachment).toEqual(view.attachment);
      expect(reloaded.latest!.attachment.packId).not.toBe(rebuilt.id);
      expect(reloaded.latest!.attachment.sources.find(source => source.sourceId === savedProof.sourceId)).toEqual(savedProof);
      expect(reloaded.latest!.changedSinceReview).toBe(true);
    });
  });
});


describe('approval race preserves command identity (P2-8)', () => {
  it('two distinct commands approving one revision yield one approval and one typed stale conflict', async () => {
    const { caseId, view } = await previewed();
    const first = approveCommand(view), second = approveCommand(view);
    const outcomes = await Promise.allSettled([repo.command(context, caseId, first, actor), repo.command(context, caseId, second, actor)]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect((outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('RECOVERY_MESSAGE_STALE_REVISION');
    expect(await count('SELECT count(*) n FROM app.recovery_message_approval WHERE tenant_id=$1 AND message_id=$2', [fixture.tenantId, view.id])).toBe(1);
    expect(kinds((await repo.read(context, caseId)).latest!)).toEqual(['previewed', 'approved']);
  });
});

describe('a recovery command id is claimed tenant-wide (Codex P2)', () => {
  it('takes the shared receipt before the case lock, so a dispatcher-ordered command with the same id gives a typed conflict, not a deadlock', async () => {
    const { caseId } = await attached();
    const command = previewCommand(await repo.read(context, caseId));
    const dispatcher = await admin.connect();
    try {
      // The shared dispatcher's order: claim the receipt, then the approval mutation takes the case lock.
      await dispatcher.query('BEGIN');
      await dispatcher.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'recovery.message.approve',$3,repeat('b',64),'processing',$4)",
        [command.commandId, fixture.tenantId, command.commandId, actor.membershipId]);
      const outcome = repo.preview(context, caseId, command, actor).then(() => 'committed', (error: { code?: string; message?: string }) => error.code ?? error.message);
      await new Promise(resolve => setTimeout(resolve, 500)); // the preview is now waiting on the receipt
      await dispatcher.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [fixture.tenantId, caseId]);
      await dispatcher.query('COMMIT');
      expect(await outcome).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    } finally { dispatcher.release(); }
  });
  it('a concurrent command of another family holding the same id makes the recovery command conflict, never both commit', async () => {
    const { caseId } = await attached();
    const command = previewCommand(await repo.read(context, caseId));
    const holder = await admin.connect();
    try {
      await holder.query('BEGIN');
      await holder.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id) VALUES($1,$2,'other.family',$3,repeat('a',64),'processing',$4)",
        [command.commandId, fixture.tenantId, command.commandId, actor.membershipId]);
      const outcome = repo.preview(context, caseId, command, actor).then(() => 'committed', (error: { code?: string }) => error.code);
      await new Promise(resolve => setTimeout(resolve, 1000)); // without the claim, the preview commits here while the other family is still open
      await holder.query('COMMIT');
      expect(await outcome).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    } finally { holder.release(); }
    expect(await count('SELECT count(*) n FROM app.recovery_message WHERE tenant_id=$1 AND case_id=$2', [fixture.tenantId, caseId])).toBe(0);
  });
});

// Ben's Command Center decision, 7 October 2026: exact replays return CURRENT case/message state.
describe('current-state replay contract (Ben, 7 October)', () => {
  it('replays preview, approval and an earlier failed advance after delivery, without another effect', async () => {
    const { caseId } = await attached();
    const preview = previewCommand(await repo.read(context, caseId));
    const first = await repo.preview(context, caseId, preview, actor);
    const approval = approveCommand(first.latest!);
    const queued = await repo.command(context, caseId, approval, actor);
    expect(await repo.preview(context, caseId, preview, actor)).toEqual(queued);
    const advance = advanceCommand(queued.latest!, 'definite_failure');
    const retry = await repo.command(context, caseId, advance, actor);
    const done = await repo.command(context, caseId, advanceCommand(retry.latest!), actor);
    expect(done.latest!.status).toBe('simulated_delivery');
    expect(await repo.preview(context, caseId, preview, actor)).toEqual(done);
    for (const command of [approval, advance]) expect(await repo.command(context, caseId, command, actor)).toEqual(done);
    expect(await code(() => repo.preview(context, caseId, { ...preview, expectedCaseRevision: preview.expectedCaseRevision + 1 }, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    for (const command of [approval, advance]) expect(await code(() => repo.command(context, caseId, { ...command, expectedRevision: command.expectedRevision + 1 }, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    expect(await sinkCount(first.latest!.id)).toBe(1);
    expect(await attemptCount(done.latest!.approval!.outboxActionId)).toBe(2);
  });

  it('replays a pre-start blocked advance as current state even after a replacement preview', async () => {
    const { caseId, view } = await approved();
    await amend(caseId, 32400);
    const advance = advanceCommand(view);
    expect(await code(() => repo.command(context, caseId, advance, actor))).toBe('RECOVERY_MESSAGE_BLOCKED');
    const blocked = await repo.read(context, caseId);
    expect(blocked.latest!.status).toBe('blocked');
    const before = await writeCounts();
    expect(await repo.command(context, caseId, advance, actor)).toEqual(blocked);
    expect(await writeCounts()).toEqual(before);
    const pack = await packs.generate(context, caseId, { commandId: randomUUID() }, actor.actorRef);
    await packs.approveAttachment(context, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
    const replacement = await repo.preview(context, caseId, previewCommand(await repo.read(context, caseId)), actor);
    expect(replacement.latest!.id).not.toBe(view.id);
    expect(await repo.command(context, caseId, advance, actor)).toEqual(replacement);
    expect(await code(() => repo.command(context, caseId, { ...advance, outcome: 'definite_failure' }, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    expect(await attemptCount(view.approval!.outboxActionId)).toBe(0);
    expect(await sinkCount(view.id)).toBe(0);
  });

  it('replays revoke (cancel) after a replacement is approved and returns the replacement plus cancelled history', async () => {
    const { caseId, view } = await approved();
    const cancel = simple('revoke', view);
    const revoked = await repo.command(context, caseId, cancel, actor);
    const replacement = await repo.preview(context, caseId, previewCommand(revoked), actor);
    const current = await repo.command(context, caseId, approveCommand(replacement.latest!), actor);
    expect(current.latest!.id).not.toBe(view.id);
    expect(current.messages[0]!.status).toBe('revoked');
    expect(await repo.command(context, caseId, cancel, actor)).toEqual(current);
    expect(await code(() => repo.command(context, caseId, { ...cancel, expectedRevision: cancel.expectedRevision + 1 }, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    expect(current.sinkCount).toBe(0);
  });

  it('replays reconciliation and the unknown advance after a later retry delivers', async () => {
    const { caseId, view } = await approved();
    const advance = advanceCommand(view, 'no_response');
    const unknown = await repo.command(context, caseId, advance, actor);
    const reconcile = simple('reconcile', unknown.latest!);
    const retry = await repo.command(context, caseId, reconcile, actor);
    expect(retry.latest!.status).toBe('retryable');
    const done = await repo.command(context, caseId, advanceCommand(retry.latest!), actor);
    for (const command of [advance, reconcile]) {
      expect(await repo.command(context, caseId, command, actor)).toEqual(done);
      expect(await code(() => repo.command(context, caseId, { ...command, expectedRevision: command.expectedRevision + 1 }, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    }
    expect(done.sinkCount).toBe(1);
    expect(done.latest!.attempts).toBe(2);
  });
});

describe('terminal changed-source refusal in real PostgreSQL (Sol 3)', () => {
  it('cancels an exhausted refusal, appends blocked history and releases a replacement preview', async () => {
    const { caseId, view } = await approved();
    let current = view;
    // Four genuine definite failures through the real service; the fifth attempt hits the real changed-source adapter.
    for (let attempt = 0; attempt < 4; attempt++) {
      current = (await repo.command(context, caseId, advanceCommand(current, 'definite_failure'), actor)).latest!;
      expect(current.status).toBe('retryable');
    }
    await amend(caseId, 32400);
    await executorWith(practiceAdapter()).execute(context, view.approval!.outboxActionId);
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('dead_letter');
    expect((await admin.query('SELECT outcome,error_code FROM app.action_attempt WHERE action_id=$1 AND attempt_number=5', [view.approval!.outboxActionId])).rows)
      .toEqual([{ outcome: 'failed', error_code: 'FAKE_BLOCKED_CHANGED' }]);
    const blocked = await repo.read(context, caseId);
    expect(blocked.latest!.status).toBe('blocked');
    expect(blocked.latest!.history.at(-1)!.kind).toBe('blocked');
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('cancelled');
    expect(await sinkCount(view.id)).toBe(0);
    const pack = await packs.generate(context, caseId, { commandId: randomUUID() }, actor.actorRef);
    await packs.approveAttachment(context, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
    const replacement = await repo.preview(context, caseId, previewCommand(await repo.read(context, caseId)), actor);
    expect(replacement.latest).toMatchObject({ sequence: 2, status: 'previewed' });
    expect(replacement.messages[0]!.status).toBe('blocked');
    expect(await repo.read(context, caseId)).toEqual(replacement);
  });
});

// EvidencePackRepository is outside this lane. Its reverse ownership check is a required follow-up, not waived.
describe('recovery refuses real evidence-pack command IDs (Sol 4, recovery half)', () => {
  it.each(['generate', 'approve_attachment'] as const)('sequential %s IDs conflict on every recovery action with no recovery effect', async family => {
    const { caseId: packCase, pack } = await attached();
    const commandId = randomUUID();
    if (family === 'generate') await packs.generate(context, packCase, { commandId }, actor.actorRef);
    else await packs.approveAttachment(context, packCase, pack.id, { commandId, expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
    const base = await approved();
    const ready = await repo.read(context, base.caseId);
    for (const run of [
      () => repo.preview(context, base.caseId, previewCommand(ready, commandId), actor),
      ...[approveCommand(base.view, commandId), advanceCommand(base.view, 'success', commandId), simple('revoke', base.view, commandId), simple('reconcile', base.view, commandId)]
        .map(command => () => repo.command(context, base.caseId, command, actor)),
    ]) expect(await code(run)).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
    expect(await repo.read(context, base.caseId)).toEqual(ready);
    expect(await count('SELECT count(*) n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2', [fixture.tenantId, commandId])).toBe(0);
  });

  it.each([['generate', 'preview'], ['approve_attachment', 'preview'], ['generate', 'approve'], ['approve_attachment', 'approve']] as const)('waits for concurrent real %s before refusing recovery %s on another case', async (family, action) => {
    const base = await previewed(), packCase = await attached();
    const commandId = randomUUID(), preview = previewCommand(base.state, commandId);
    const holder = await admin.connect();
    const waiting = async (key: string) => (await admin.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid::bigint=(hashtext($1)::bigint & 4294967295)", [key])).rowCount !== 0;
    let packOutcome: Promise<unknown> | undefined, messageOutcome: Promise<string> | undefined;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [fixture.tenantId, packCase.caseId]);
      packOutcome = family === 'generate'
        ? packs.generate(context, packCase.caseId, { commandId }, actor.actorRef)
        : packs.approveAttachment(context, packCase.caseId, packCase.pack.id, { commandId, expectedManifestHash: packCase.pack.manifestHash, expectedContentHash: packCase.pack.contentHash }, actor.actorRef);
      // Observe real service lock acquisition; no fictional family rows or timing sleeps choose the winner.
      await until(() => waiting(packCase.caseId), 'the real pack service case lock');
      messageOutcome = code(() => action === 'preview' ? repo.preview(context, base.caseId, preview, actor) : repo.command(context, base.caseId, approveCommand(base.view, commandId), actor));
      await until(() => waiting(`pack-command:${commandId}`), 'recovery waiting on the pack command identity');
      await holder.query('COMMIT');
      await packOutcome;
      expect(await messageOutcome).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
      expect(await repo.read(context, base.caseId)).toEqual(base.state);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined); holder.release();
      await Promise.allSettled([packOutcome, messageOutcome].filter(Boolean));
    }
  });
});

describe('exhausted plain delivery failures in real PostgreSQL (Opus P1-2)', () => {
  it('records failed after five retryable adapter failures and keeps the message panel readable', async () => {
    const { caseId, view } = await approved();
    let current = view;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const result = await repo.command(context, caseId, advanceCommand(current, 'definite_failure'), actor);
      current = result.latest!;
      expect(current.status).toBe(attempt === 5 ? 'failed' : 'retryable');
      expect(current.attempts).toBe(attempt);
      expect(current.history.at(-1)!.kind).toBe(attempt === 5 ? 'failed' : 'retryable');
    }
    expect(await outboxStatus(view.approval!.outboxActionId)).toBe('dead_letter');
    expect((await admin.query('SELECT outcome FROM app.action_attempt WHERE action_id=$1 ORDER BY attempt_number', [view.approval!.outboxActionId])).rows.map(row => row.outcome))
      .toEqual(['retryable', 'retryable', 'retryable', 'retryable', 'failed']);
    const panel = await repo.read(context, caseId);
    expect(panel.latest!.status).toBe('failed');
    expect(panel.latest!.history.at(-1)!.kind).toBe('failed');
    expect(panel.sinkCount).toBe(0);
    const before = await writeCounts();
    expect(await code(() => repo.command(context, caseId, advanceCommand(current), actor))).toBe('RECOVERY_MESSAGE_NOT_ADVANCEABLE');
    expect(await repo.read(context, caseId)).toEqual(panel);
    expect(await writeCounts()).toEqual(before);
    expect(await attemptCount(view.approval!.outboxActionId)).toBe(5);
    expect(await sinkCount(view.id)).toBe(0);
  });
});

// ---- Round 9: M4-1-S-R integration. app.recovery_case_current is the one read contract for a case's live revision, claim and
// received money (received = GREATEST(manual landings, approved landings), never their sum). A message must state exactly what
// the workbench shows, and the delivery guard must compare against the same figure.
describe('a message states the one current case figures, approved landings included (round 9)', () => {
  /** What the workbench shows for the case, from the shared projection and nothing else. */
  const currentOf = async (caseId: string) => {
    const row = (await admin.query('SELECT revision,claim_pence,landed,manual_landed,approved_landed,written_off,claim_pence-landed-written_off AS outstanding FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, caseId])).rows[0];
    return { revision: Number(row.revision), claim: Number(row.claim_pence), landed: Number(row.landed), manual: Number(row.manual_landed), approvedLanded: Number(row.approved_landed), writtenOff: Number(row.written_off), outstanding: Number(row.outstanding) };
  };
  /** The message snapshot as the guards read it. */
  const snapshotOf = async (caseId: string) => {
    const row = (await admin.query('SELECT case_revision,outstanding_pence FROM app.recovery_message_case_snapshot($1,$2,$3)', [fixture.tenantId, fixture.jobId, caseId])).rows[0];
    return row ? { revision: Number(row.case_revision), outstanding: Number(row.outstanding_pence) } : null;
  };
  /** The fixture job is live with an accepted quote; the landing routine also needs the synthetic activation and cap that switch-live demos record. */
  async function activateJobForLanding() {
    const activation = randomUUID(), db = await admin.connect();
    try {
      await db.query('BEGIN'); await db.query("SELECT set_config('app.tenant_id',$1,true)", [fixture.tenantId]);
      await db.query("INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at) VALUES($1,$2,$3,$4,1,$5,'synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',$6,now())",
        [activation, fixture.tenantId, fixture.jobId, fixture.quoteId, hash('quote immutable fixture'), fixture.memberId]);
      await db.query("INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative) VALUES($1,$2,$3,$4,$5,1880000,'GBP',28200,'reference_fee_policy_v1',true)",
        [randomUUID(), fixture.tenantId, fixture.jobId, activation, fixture.quoteId]);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK').catch(() => undefined); throw error; } finally { db.release(); }
  }
  /** A settled synthetic receipt plus current eligibility and landing approvals for the case's current revision; returns the landing command for those. */
  async function landingCommand(caseId: string, grossPence: number, eligibleNetPence = grossPence) {
    const receipt = randomUUID(), eligibility = randomUUID(), landing = randomUUID(), { revision } = await currentOf(caseId);
    await admin.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at) VALUES($1::uuid,$2::uuid,$3::uuid,$1::text,$1::text,'settled',$4,'GBP',true,now())", [receipt, fixture.tenantId, fixture.jobId, grossPence]);
    for (const [id, kind] of [[eligibility, 'eligibility'], [landing, 'landing']]) {
      await admin.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id) VALUES($1,$2,$3,$4,$5,$6,'approved','reference_fee_policy_v1',now()+interval '1 hour',$7)", [id, fixture.tenantId, fixture.jobId, caseId, kind, revision, randomUUID()]);
    }
    return { version: 'recovery.landing.approve.v1', policyVersion: 'reference_fee_policy_v1', allocationId: randomUUID(), derivationId: randomUUID(), journalId: randomUUID(), jobId: fixture.jobId, caseId,
      receiptId: receipt, evidenceId: fixture.proofId, eligibilityApprovalId: eligibility, landingApprovalId: landing, grossPence, eligibleNetPence, currency: 'GBP', expectedCaseRevision: revision };
  }
  const approveLanding = (command: object) => inTenant(query => query('SELECT app.approve_synthetic_landing($1::jsonb) id', [command]));
  /** Land `pence` through the approved-landing routine on a case (a fresh receipt and fresh approvals each time). */
  const land = async (caseId: string, pence: number) => { await approveLanding(await landingCommand(caseId, pence)); };
  /** A pack for the case as it stands now, with its attachment approved, so that a message can be previewed over it. */
  async function packAndApprove(caseId: string) {
    const pack = await packs.generate(context, caseId, { commandId: randomUUID() }, actor.actorRef);
    await packs.approveAttachment(context, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
    return pack;
  }
  /** Is anything waiting for this case's advisory lock key (the key 0097's landing routine and every message guard take)? */
  const waitingForCaseLock = async (caseId: string) => (await admin.query(
    "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objsubid=2 AND classid=(hashtext($1)::bigint & 4294967295)::oid AND objid=(hashtext($2)::bigint & 4294967295)::oid", [fixture.tenantId, caseId])).rowCount !== 0;
  const byHand = async (caseId: string, revision: number, extra: Record<string, unknown>) => cases.command(context, fixture.jobId, { version: 'recovery-case-command.v1', action: 'transition', commandId: randomUUID(), caseId, reviewerRef: 'practice-owner', expectedRevision: revision, ...extra }, await reviewerOf());

  it('previews the amount and revision recovery_case_current shows after an approved landing', async () => {
    await inIsolatedWorld(async () => {
      await activateJobForLanding();
      const { caseId } = await attached();
      await land(caseId, 12000);
      const figures = await currentOf(caseId);
      expect(figures).toEqual({ revision: OPENED, claim: 32000, landed: 12000, manual: 0, approvedLanded: 12000, writtenOff: 0, outstanding: 20000 });
      const ready = await repo.read(context, caseId);
      expect(ready.readiness).toMatchObject({ eligible: true, caseRevision: figures.revision, outstandingPence: figures.outstanding });
      const view = (await repo.preview(context, caseId, previewCommand(ready), actor)).latest!;
      expect(view.message).toMatchObject({ amountPence: figures.outstanding, caseRevision: figures.revision });
      expect(view.message.body).toBe(customerBody.replace('£320.00', '£200.00'));
      const stored = (await admin.query('SELECT amount_pence,case_revision FROM app.recovery_message WHERE id=$1', [view.id])).rows[0];
      expect({ amount: Number(stored.amount_pence), revision: stored.case_revision }).toEqual({ amount: figures.outstanding, revision: figures.revision });
    });
  });

  it('counts money recorded by hand and the same money approved as one amount, never their sum', async () => {
    await inIsolatedWorld(async () => {
      await activateJobForLanding();
      const caseId = await newCase();
      const assembled = await byHand(caseId, OPENED, { eventType: 'assemble_evidence' });
      const landed = await byHand(caseId, assembled.revision, { eventType: 'record_landing', amountPence: 12000 });
      await packAndApprove(caseId);
      // The same £120.00 approved as well: still £120.00 received, so £200.00 is outstanding (a sum would say £80.00).
      await land(caseId, 12000);
      expect(await currentOf(caseId)).toMatchObject({ revision: landed.revision, landed: 12000, manual: 12000, approvedLanded: 12000, outstanding: 20000 });
      const first = (await repo.preview(context, caseId, previewCommand(await repo.read(context, caseId)), actor)).latest!;
      expect(first.message).toMatchObject({ amountPence: 20000, caseRevision: landed.revision });
      // Approved money beyond the hand-recorded amount: received is the larger figure, £200.00, so £120.00 is outstanding (a sum would be exhausted).
      await land(caseId, 8000);
      const figures = await currentOf(caseId);
      expect(figures).toMatchObject({ revision: landed.revision, landed: 20000, manual: 12000, approvedLanded: 20000, outstanding: 12000 });
      const ready = await repo.read(context, caseId);
      expect(ready.readiness).toMatchObject({ eligible: true, caseRevision: figures.revision, outstandingPence: 12000 });
      expect(ready.latest).toMatchObject({ id: first.id, changedSinceReview: true });
      const second = (await repo.preview(context, caseId, previewCommand(ready), actor)).latest!;
      expect(second.message).toMatchObject({ amountPence: 12000, caseRevision: figures.revision });
      expect(second.message.body).toBe(customerBody.replace('£320.00', '£120.00'));
    });
  });

  it('gives the snapshot the same revision and outstanding as recovery_case_current for every case shape', async () => {
    await inIsolatedWorld(async () => {
      await activateJobForLanding();
      const opened = await newCase();
      expect(await snapshotOf(opened)).toEqual({ revision: OPENED, outstanding: 32000 });
      const handed = await newCase();
      const partly = await byHand(handed, (await byHand(handed, OPENED, { eventType: 'assemble_evidence' })).revision, { eventType: 'record_landing', amountPence: 5000 });
      const writtenOff = await byHand(handed, partly.revision, { eventType: 'write_off' });
      expect(await snapshotOf(handed)).toEqual({ revision: writtenOff.revision, outstanding: 0 });
      const approvedOnly = await newCase();
      await land(approvedOnly, 7000);
      const mixed = await newCase();
      await byHand(mixed, (await byHand(mixed, OPENED, { eventType: 'assemble_evidence' })).revision, { eventType: 'record_landing', amountPence: 3000 });
      await land(mixed, 9000);
      const amended = await newCase();
      await amend(amended, 40000);
      for (const caseId of [opened, handed, approvedOnly, mixed, amended]) {
        const figures = await currentOf(caseId);
        expect(await snapshotOf(caseId), caseId).toEqual({ revision: figures.revision, outstanding: figures.outstanding });
      }
      expect(await currentOf(approvedOnly)).toMatchObject({ landed: 7000, outstanding: 25000 });
      expect(await currentOf(mixed)).toMatchObject({ landed: 9000, manual: 3000, approvedLanded: 9000, outstanding: 23000 });
    });
  });

  it('keeps a case with no workbench history out of messages, as before', async () => {
    await inIsolatedWorld(async () => {
      const legacy = randomUUID();
      await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,32000,'GBP','identified',0,true,'withheld_customer_payment','Fictional counterparty','builder_customer','customer_invoice',$4)",
        [legacy, fixture.tenantId, fixture.jobId, JSON.stringify([fixture.invoiceId])]);
      // The shared projection does show it (from its creation snapshot); a message is never built from that snapshot.
      expect((await admin.query('SELECT revision,claim_pence FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2', [fixture.tenantId, legacy])).rows[0]).toMatchObject({ revision: 0, claim_pence: '32000' });
      expect(await snapshotOf(legacy)).toBeNull();
      expect(await code(() => repo.read(context, legacy))).toBe('RECOVERY_MESSAGE_NOT_FOUND');
    });
  });

  it('refuses to deliver a message previewed and approved before an approved landing, and sinks nothing', async () => {
    await inIsolatedWorld(async () => {
      await activateJobForLanding();
      const { caseId, view } = await approved();
      expect(view.message.amountPence).toBe(32000);
      await land(caseId, 12000);
      // The landing does not move the case revision, only the money outstanding; the saved message must still see that it changed.
      expect(await currentOf(caseId)).toMatchObject({ revision: OPENED, outstanding: 20000 });
      expect((await viewOf(caseId)).changedSinceReview).toBe(true);
      expect(await code(() => repo.command(context, caseId, advanceCommand(view), actor))).toBe('RECOVERY_MESSAGE_BLOCKED');
      expect(await sinkCount(view.id)).toBe(0);
      expect(await outboxStatus(view.approval!.outboxActionId)).toBe('cancelled');
      expect((await viewOf(caseId)).status).toBe('blocked');
    });
  });

  it('refuses the shared executor and a raw sink row after an approved landing, whatever the caller', async () => {
    await inIsolatedWorld(async () => {
      await activateJobForLanding();
      const direct = await approved();
      const raw = await approved();
      await land(direct.caseId, 12000);
      await land(raw.caseId, 4000);
      await executorWith(practiceAdapter()).execute(context, direct.view.approval!.outboxActionId);
      expect(await sinkCount(direct.view.id)).toBe(0);
      expect(await outboxStatus(direct.view.approval!.outboxActionId)).toBe('retryable');
      expect((await admin.query('SELECT error_code FROM app.action_attempt WHERE action_id=$1', [direct.view.approval!.outboxActionId])).rows).toEqual([{ error_code: 'FAKE_BLOCKED_CHANGED' }]);
      await admin.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp() WHERE id=$1", [raw.view.approval!.outboxActionId]);
      expect(await code(() => rawSink(raw.caseId, raw.view))).toBe('23514');
      expect(await sinkCount(raw.view.id)).toBe(0);
    });
  });

  it('serializes a delivery and the approved-landing routine on the one case lock, in both orders', async () => {
    await inIsolatedWorld(async () => {
      await activateJobForLanding();
      // Order 1: the landing routine holds the case lock, so a delivery that started meanwhile waits for it and then sees the landing.
      const first = await approved();
      const landing = await runtime.connect();
      try {
        await landing.query('BEGIN'); await landing.query("SELECT set_config('app.tenant_id',$1,true)", [fixture.tenantId]);
        await landing.query('SELECT app.approve_synthetic_landing($1::jsonb) id', [await landingCommand(first.caseId, 12000)]);
        const running = executorWith(practiceAdapter()).execute(context, first.view.approval!.outboxActionId);
        await until(() => waitingForCaseLock(first.caseId), 'the delivery held behind the landing routine');
        expect(await sinkCount(first.view.id)).toBe(0);
        await landing.query('COMMIT'); await running;
      } finally { await landing.query('ROLLBACK').catch(() => undefined); landing.release(); }
      expect(await sinkCount(first.view.id)).toBe(0); // the delivery waited, then found the case had changed
      expect(await outboxStatus(first.view.approval!.outboxActionId)).toBe('retryable');
      expect(await count('SELECT count(*) n FROM app.landing_allocation WHERE case_id=$1', [first.caseId])).toBe(1);
      // Order 2: a delivery transaction holds the case lock at the sink, so the landing routine waits and lands only after the delivery committed.
      const second = await approved();
      await admin.query("UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp() WHERE id=$1", [second.view.approval!.outboxActionId]);
      const command = await landingCommand(second.caseId, 12000);
      const sink = await runtime.connect();
      try {
        await sink.query('BEGIN'); await sink.query("SELECT set_config('app.tenant_id',$1,true)", [fixture.tenantId]);
        await sink.query(`INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'locked','synthetic_demo',0)`, [randomUUID(), fixture.tenantId, fixture.jobId, second.caseId, second.view.id, second.view.approval!.outboxActionId, second.view.message.recipient, second.view.message.body, second.view.message.contentHash, second.view.message.attachmentHash]);
        let landed = false;
        const landing2 = approveLanding(command).then(() => { landed = true; });
        await until(() => waitingForCaseLock(second.caseId), 'the landing routine held behind the delivery');
        expect(landed).toBe(false);
        expect(await count('SELECT count(*) n FROM app.landing_allocation WHERE case_id=$1', [second.caseId])).toBe(0);
        await sink.query('COMMIT'); await landing2;
        expect(landed).toBe(true);
      } finally { await sink.query('ROLLBACK').catch(() => undefined); sink.release(); }
      expect(await sinkCount(second.view.id)).toBe(1);
      expect(await count('SELECT count(*) n FROM app.landing_allocation WHERE case_id=$1', [second.caseId])).toBe(1);
    });
  });
});

describe('an old check request replayed after a retry cycle returns current state (round 10, Opus P2-1)', () => {
  const UNKNOWN = ['previewed', 'approved', 'started', 'outcome_unknown'];
  afterEach(() => { vi.restoreAllMocks(); });
  /** Asks of the practice provider, counted: a replay that returns current state never reaches it. */
  const providerChecks = () => vi.spyOn(FakeRecoveryMessageAdapter.prototype, 'reconcile');
  /**
   * Check C1 finds no provider record, the owner retries, and attempt 2 is uncertain again. C1 is now an old request: the uncertainty
   * the message is in belongs to attempt 2, which no check has looked at yet.
   */
  async function retriedAndUncertainAgain() {
    const base = await approved();
    const outboxId = base.view.approval!.outboxActionId;
    const unknown1 = await repo.command(context, base.caseId, advanceCommand(base.view, 'no_response'), actor);
    const firstCheck = simple('reconcile', unknown1.latest!);
    const checked = await repo.command(context, base.caseId, firstCheck, actor);
    expect(checked.latest).toMatchObject({ status: 'retryable', attempts: 1 });
    const unknown2 = await repo.command(context, base.caseId, advanceCommand(checked.latest!, 'no_response'), actor);
    expect(unknown2.latest).toMatchObject({ status: 'outcome_unknown', attempts: 2 });
    expect(await storedKinds(base.view.id)).toEqual([...UNKNOWN, 'reconcile_started', 'retryable', 'started', 'outcome_unknown']);
    return { ...base, outboxId, firstCheck, unknown2 };
  }

  it('returns current state for the old check: no provider call, no write, no history, the delivery record still unknown', async () => {
    const { caseId, view, outboxId, firstCheck, unknown2 } = await retriedAndUncertainAgain();
    const kindsBefore = await storedKinds(view.id), auditsBefore = await auditTypes(view.id), before = await writeCounts();
    const asked = providerChecks();
    expect(await repo.command(context, caseId, firstCheck, actor)).toEqual(unknown2);
    expect(await repo.command(context, caseId, firstCheck, actor)).toEqual(unknown2);
    expect(asked).not.toHaveBeenCalled();
    expect(await outboxStatus(outboxId)).toBe('outcome_unknown');
    expect(await storedKinds(view.id)).toEqual(kindsBefore);
    expect(await auditTypes(view.id)).toEqual(auditsBefore);
    expect(await writeCounts()).toEqual(before);
    expect(await attemptCount(outboxId)).toBe(2);
    expect(await sinkCount(view.id)).toBe(0);
    // Reusing the id for a different request is still a typed conflict, never a replay.
    expect(await code(() => repo.command(context, caseId, { ...firstCheck, expectedRevision: firstCheck.expectedRevision + 1 }, actor))).toBe('RECOVERY_MESSAGE_COMMAND_CONFLICT');
  });

  it('leaves the message usable: typed refusals, then a fresh check and one retry that delivers exactly once', async () => {
    const { caseId, view, outboxId, firstCheck, unknown2 } = await retriedAndUncertainAgain();
    await repo.command(context, caseId, firstCheck, actor);
    // Every refusal is a typed one (never a raw database rule error), and none of them wrote anything.
    expect(await code(() => repo.command(context, caseId, advanceCommand(unknown2.latest!), actor))).toBe('RECOVERY_MESSAGE_RECONCILE_REQUIRED');
    expect(await code(() => repo.command(context, caseId, simple('revoke', unknown2.latest!), actor))).toBe('RECOVERY_MESSAGE_NOT_REVOCABLE');
    expect(await code(() => repo.preview(context, caseId, previewCommand(unknown2), actor))).toBe('RECOVERY_MESSAGE_EXISTING_EFFECT');
    expect(await storedKinds(view.id)).toEqual([...UNKNOWN, 'reconcile_started', 'retryable', 'started', 'outcome_unknown']);
    // A fresh check asks the provider about attempt 2, finds no record and records it.
    const asked = providerChecks();
    const checked = await repo.command(context, caseId, simple('reconcile', unknown2.latest!), actor);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(checked.latest).toMatchObject({ status: 'retryable', attempts: 2 });
    expect(await storedKinds(view.id)).toEqual([...UNKNOWN, 'reconcile_started', 'retryable', 'started', 'outcome_unknown', 'reconcile_started', 'retryable']);
    expect(await sinkCount(view.id)).toBe(0);
    const delivered = await repo.command(context, caseId, advanceCommand(checked.latest!), actor);
    expect(delivered.latest).toMatchObject({ status: 'simulated_delivery', attempts: 3 });
    expect(await sinkCount(view.id)).toBe(1);
    expect(await outboxStatus(outboxId)).toBe('succeeded');
    // The old request still returns current state, now the delivered one, with nothing more sent.
    expect(await repo.command(context, caseId, firstCheck, actor)).toEqual(delivered);
    expect(await sinkCount(view.id)).toBe(1);
    expect(await attemptCount(outboxId)).toBe(3);
  });

  it('lets the owner revoke after a fresh check, never reaching a delivery', async () => {
    const { caseId, view, outboxId, firstCheck, unknown2 } = await retriedAndUncertainAgain();
    await repo.command(context, caseId, firstCheck, actor);
    const checked = await repo.command(context, caseId, simple('reconcile', unknown2.latest!), actor);
    expect(checked.latest!.status).toBe('retryable');
    const revoked = await repo.command(context, caseId, simple('revoke', checked.latest!), actor);
    expect(revoked.latest).toMatchObject({ status: 'revoked', attempts: 2 });
    expect(await outboxStatus(outboxId)).toBe('cancelled');
    expect(await sinkCount(view.id)).toBe(0);
    expect(await repo.command(context, caseId, firstCheck, actor)).toEqual(revoked);
  });

  it('returns current state for a check whose own answer was "still unknown", asking the provider only once', async () => {
    const base = await approved();
    const outboxId = base.view.approval!.outboxActionId;
    const unknown = await repo.command(context, base.caseId, advanceCommand(base.view, 'no_response'), actor);
    const check = simple('reconcile', unknown.latest!);
    const asked = providerChecks().mockResolvedValueOnce('unknown');
    const answered = await repo.command(context, base.caseId, check, actor);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(answered.latest).toMatchObject({ status: 'outcome_unknown', attempts: 1 });
    expect(await storedKinds(base.view.id)).toEqual([...UNKNOWN, 'reconcile_started', 'outcome_unknown']);
    const before = await writeCounts();
    expect(await repo.command(context, base.caseId, check, actor)).toEqual(answered);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(await writeCounts()).toEqual(before);
    expect(await storedKinds(base.view.id)).toEqual([...UNKNOWN, 'reconcile_started', 'outcome_unknown']);
    expect(await outboxStatus(outboxId)).toBe('outcome_unknown');
    // A fresh check from the reloaded panel is what asks again, and it can settle the message.
    const settled = await repo.command(context, base.caseId, simple('reconcile', answered.latest!), actor);
    expect(settled.latest).toMatchObject({ status: 'retryable', attempts: 1 });
  });
});
