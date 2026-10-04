import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRecoveryMessage, recoveryMessageSourceOf, RECOVERY_MESSAGE_CHANGED } from '@jobguard/core';
import {
  ActionExecutor, EvidencePackRepository, RecoveryCaseRepository, RecoveryMessageRepository, migrate, withTenant,
  type RecoveryMessageActor, type RecoveryMessageState, type VerifiedTenantContext,
} from '../src/index.js';
import { closeTestPools } from './pool-test-utils.js';
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

async function code(run: () => Promise<unknown>): Promise<string> {
  try { await run(); } catch (error) { return (error as { code?: string; message?: string }).code ?? (error as Error).message; }
  throw new Error('expected the call to fail');
}
async function newCase(caseType: 'withheld_customer_payment' | 'merchant_overcharge' | 'prevention' = 'withheld_customer_payment') {
  const id = randomUUID();
  const refs = caseType === 'merchant_overcharge' ? [fixture.rateId, fixture.supplierInvoiceId, fixture.supplierDeliveryId] : [fixture.invoiceId];
  await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,32000,'GBP','identified',0,true,$4,'Fictional counterparty',$5,$6,$7)",
    [id, fixture.tenantId, fixture.jobId, caseType, caseType === 'merchant_overcharge' ? 'supplier_cost' : 'builder_customer', caseType === 'merchant_overcharge' ? 'supplier_documents' : 'customer_invoice', JSON.stringify(refs)]);
  await admin.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,32000,'GBP','fixture-owner',$5)", [randomUUID(), fixture.tenantId, fixture.jobId, id, hash(id)]);
  // A real case always starts with its opening event, so its revision is claim 1 + event 1.
  await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,$5,NULL,$6,'fixture-owner',$7,$8)",
    [randomUUID(), fixture.tenantId, fixture.jobId, id, caseType === 'prevention' ? 'prevent' : 'opened', caseType === 'prevention' ? 'prevented' : 'identified', randomUUID(), hash(`open:${id}`)]);
  return id;
}
async function attached(caseType: 'withheld_customer_payment' | 'merchant_overcharge' = 'withheld_customer_payment') {
  const caseId = await newCase(caseType);
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
const advanceCommand = (view: NonNullable<RecoveryMessageState['latest']>, outcome: 'success' | 'response_lost' | 'no_response' | 'definite_failure' = 'success', commandId = randomUUID()) => ({
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

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'jg-recovery-messages-'));
  const port = 60900 + Math.floor(Math.random() * 200);
  const postgresLog: string[] = [];
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'synthetic', persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ['--lc-messages=C'], onLog: message => { postgresLog.push(message); } });
  try { await postgres.initialise(); await postgres.start(); } catch (error) { throw new Error(`${String(error)}\n${postgresLog.join('\n')}`); }
  admin = new Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'synthetic', database: 'postgres' });
  await migrate(admin); fixture = await seedEvidencePackFixture(admin);
  await admin.query("CREATE ROLE message_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO message_login");
  runtime = new Pool({ host: '127.0.0.1', port, user: 'message_login', password: 'synthetic', database: 'postgres', max: 12 });
  context = { tenantId: fixture.tenantId } as VerifiedTenantContext;
  otherContext = { tenantId: fixture.otherTenantId } as VerifiedTenantContext;
  repo = new RecoveryMessageRepository(runtime); packs = new EvidencePackRepository(runtime); cases = new RecoveryCaseRepository(runtime);
  actor = { membershipId: fixture.memberId, actorRef: `membership:${fixture.memberId}` };
  // A non-owner member and a revoked owner in the same tenant, for authority checks.
  const accountId = (await admin.query('SELECT account_id FROM app.membership WHERE id=$1', [fixture.memberId])).rows[0].account_id;
  const make = async (role: string, revoked: boolean) => {
    const identity = randomUUID(), membership = randomUUID();
    await admin.query('INSERT INTO identity.identity_user(id) VALUES($1)', [identity]);
    await admin.query('INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at) VALUES($1,$2,$3,$4,$5,$6)', [membership, fixture.tenantId, accountId, identity, role, revoked ? new Date() : null]);
    return { membershipId: membership, actorRef: `membership:${membership}` };
  };
  memberActor = await make('member', false); revokedActor = await make('owner', true);
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
    await cases.command(context, fixture.jobId, { version: 'recovery-case-command.v1', action: 'amend_claim', commandId: randomUUID(), caseId, claimedNetPence: 32100, reviewerRef: 'practice-owner', expectedRevision: OPENED });
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
    await cases.command(context, fixture.jobId, { version: 'recovery-case-command.v1', action: 'amend_claim', commandId: randomUUID(), caseId, claimedNetPence: 32200, reviewerRef: 'practice-owner', expectedRevision: OPENED });
    expect(await code(() => repo.command(context, caseId, approveCommand(view), actor))).toBe('RECOVERY_MESSAGE_CHANGED');
    for (const table of ['decision', 'decision_resolution', 'action_authorization']) {
      expect(await count(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND ${table === 'decision' ? 'subject_ref' : 'id::text'}=$2`, [fixture.tenantId, view.id])).toBe(0);
    }
    expect(await count("SELECT count(*) n FROM app.command_receipt WHERE tenant_id=$1 AND semantic_key=$2", [fixture.tenantId, `recovery-message-approve:${view.id}`])).toBe(0);
    expect(await count("SELECT count(*) n FROM app.action_outbox WHERE tenant_id=$1 AND provider_effect_key=$2", [fixture.tenantId, `recovery-message:${view.id}`])).toBe(0);
    expect(await count("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='recovery.message.approved'", [fixture.tenantId, view.id])).toBe(0);
  });

  it('refuses a superseded preview and a second live approval on the same case', async () => {
    const { caseId, view } = await previewed();
    const newer = await repo.preview(context, caseId, previewCommand(await repo.read(context, caseId)), actor);
    expect(newer.messages).toHaveLength(2);
    expect(await code(() => repo.command(context, caseId, approveCommand(view), actor))).toBe('RECOVERY_MESSAGE_CHANGED');
    const approvedState = await repo.command(context, caseId, approveCommand(newer.latest!), actor);
    expect(approvedState.latest!.status).toBe('queued');
    const third = await repo.preview(context, caseId, previewCommand(await repo.read(context, caseId)), actor);
    expect(await code(() => repo.command(context, caseId, approveCommand(third.latest!), actor))).toBe('RECOVERY_MESSAGE_EXISTING_EFFECT');
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
    await cases.command(context, fixture.jobId, { version: 'recovery-case-command.v1', action: 'amend_claim', commandId: randomUUID(), caseId, claimedNetPence: 32300, reviewerRef: 'practice-owner', expectedRevision: OPENED });
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
  async function inTenant<T>(run: (query: (sql: string, args?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>) => Promise<T>) {
    return withTenant(runtime, context, db => run((sql, args) => db.$client.query(sql, args)));
  }
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
