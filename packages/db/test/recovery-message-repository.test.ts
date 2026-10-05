import { describe, expect, it, vi } from 'vitest';
import { buildRecoveryMessage } from '@jobguard/core';
import { UserCommandDispatcher } from '../src/commands.js';
import type { Pool } from 'pg';
import { RecoveryMessageRepository } from '../src/recovery-message-repository.js';
import type { VerifiedTenantContext } from '../src/tenant-context.js';

// Service fault tests only: these doubles prove orchestration/replay, never PostgreSQL guarantees.
const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ctx = { tenantId: id(100) } as VerifiedTenantContext;
const actor = { membershipId: id(101), actorRef: `membership:${id(101)}` };
function interrupted(kind: 'started' | 'reconcile_started') {
  const history = kind === 'started' ? ['previewed', 'approved', 'started'] : ['previewed', 'approved', 'started', 'outcome_unknown', 'reconcile_started'];
  const audits: string[] = [];
  const row = { id: id(6), job_id: id(2), case_id: id(1), outbox_action_id: id(8), outbox_status: 'succeeded', content_hash: 'a'.repeat(64),
    approving_membership_id: actor.membershipId, attempts: 1 };
  const pool = { connect: async () => ({ release() {}, query: async (sql: string) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('set_config')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM app.action_outbox')) return { rows: [{ status: row.outbox_status, claimed_at: null }], rowCount: 1 };
    if (sql.includes('FROM app.recovery_message_event')) return { rows: history.map((kind, i) => ({ message_id: row.id, revision: i + 1, kind, command_id: id(50), request_hash: 'c'.repeat(64), actor_membership_id: actor.membershipId })), rowCount: history.length };
    if (sql.includes('FROM app.action_attempt')) return { rows: [{ id: id(90), attempt_number: 1, outcome: 'succeeded' }], rowCount: 1 };
    throw new Error(`Unexpected SQL in service double: ${sql}`);
  } }) } as unknown as Pool;
  const repo = new RecoveryMessageRepository(pool);
  // Keep the real repair/command orchestration, replace only storage boundaries.
  const service = repo as unknown as { [key: string]: (...args: any[]) => Promise<any> };
  service.lockCase = async () => undefined;
  service.begin = async () => undefined;
  service.messageRows = async () => [row]; service.messageRow = async () => row;
  service.revisionOf = async () => history.length;
  service.isReplay = async () => ({ kind, caseId: id(1), requestHash: 'c'.repeat(64) });
  service.event = async (_db, _tenant, _message, _actor, eventKind) => { history.push(eventKind); return history.length; };
  service.audit = async (_db, _actor, _message, eventKind) => { audits.push(eventKind); };
  service.appendHistoryAudit = async (_db, events) => { audits.push(...events.map((event: { eventType: string }) => event.eventType.split('.').at(-1))); };
  service.state = async () => ({ latest: { status: 'simulated_delivery', history: history.map(kind => ({ kind })) } });
  return { repo, history, audits };
}
describe('interrupted recovery message result recording (P2-5)', () => {
  it.each(['started', 'reconcile_started'] as const)('a read restores a committed outcome after %s', async kind => {
    const { repo, history, audits } = interrupted(kind);
    await repo.read(ctx, id(1));
    const terminal = kind === 'started' ? 'succeeded' : 'reconciled';
    expect(history.at(-1)).toBe(terminal); expect(audits).toContain(terminal);
    await repo.read(ctx, id(1));
    expect(history.filter(k => k === terminal)).toHaveLength(1);
  });
  it('replaying the exact reconciliation command restores the terminal history before returning', async () => {
    const { repo, history } = interrupted('reconcile_started');
    await repo.command(ctx, id(1), { version: 'recovery-message-command.v1', commandId: id(50), messageId: id(6), expectedRevision: 4, action: 'reconcile' }, actor);
    expect(history.at(-1)).toBe('reconciled');
  });
});

describe('elapsed claims at the command boundary (P2-6)', () => {
  it('refuses a blind advance using the same unknown classification as the read projection', async () => {
    const repo = new RecoveryMessageRepository({} as Pool);
    const service = repo as unknown as { statusOf: (db: unknown, tenantId: string, row: unknown) => Promise<string> };
    const db = { $client: { query: async () => ({ rowCount: 0 }) } };
    const row = { id: id(6), outbox_action_id: id(8), outbox_status: 'executing', claimed_at: new Date(Date.now() - 600_000) };
    expect(await service.statusOf(db, ctx.tenantId, row)).toBe('outcome_unknown');
    expect(await service.statusOf(db, ctx.tenantId, { ...row, claimed_at: new Date() })).toBe('executing');
  });
});


describe('two-context approval identity (P2-8)', () => {
  it("reports stale when the shared dispatcher returned another command's semantic replay", async () => {
    const message = buildRecoveryMessage({ caseId: id(1), jobId: id(2), caseType: 'withheld_customer_payment', caseRevision: 2, amountPence: 32000,
      sourceRefs: [id(5)], packId: id(3), packRevision: 1, manifestHash: 'a'.repeat(64), attachmentHash: 'b'.repeat(64) });
    const pool = { connect: async () => ({ release() {}, query: async (sql: string) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('set_config')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM app.recovery_message_event')) return { rows: [], rowCount: 0 }; // this command did not approve it
      throw new Error(`Unexpected service-double SQL: ${sql}`);
    } }) } as unknown as Pool;
    const repo = new RecoveryMessageRepository(pool);
    const service = repo as unknown as { [key: string]: (...args: any[]) => Promise<any> };
    service.begin = async () => undefined; service.isReplay = async () => null;
    service.messageRow = async () => ({ id: id(6), job_id: id(2), created_at: new Date(), immutable_content: message.immutableContent, content_hash: message.contentHash,
      recipient: message.recipient, case_revision: 2, amount_pence: '32000' });
    service.revisionOf = async () => 1;
    const dispatch = vi.spyOn(UserCommandDispatcher.prototype, 'dispatch').mockResolvedValue({ messageId: id(6) });
    try {
      await expect(service.approve!(ctx, id(1), id(6), { version: 'recovery-message-command.v1', commandId: id(50), messageId: id(6), action: 'approve', expectedRevision: 1,
        recipient: message.recipient, body: message.body, amountPence: 32000, packId: id(3), contentHash: message.contentHash }, actor, 'c'.repeat(64)))
        .rejects.toMatchObject({ code: 'RECOVERY_MESSAGE_STALE_REVISION' });
    } finally { dispatch.mockRestore(); }
  });
});
