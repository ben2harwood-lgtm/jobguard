import { beginRecoveryCommand } from "../src/recovery-command.js";
import { RecoveryFollowUpRepository, RecoveryFollowUpError } from "../src/recovery-follow-up-repository.js";
import { testTenantContext } from './tenant-context-test-utils.js';
import { describe, expect, it, vi } from 'vitest';
import { buildRecoveryMessage } from '@jobguard/core';
import { UserCommandDispatcher } from '../src/commands.js';
import type { Pool } from 'pg';
import { RecoveryMessageError, RecoveryMessageRepository } from '../src/recovery-message-repository.js';

// Service fault tests only: these doubles prove orchestration/replay, never PostgreSQL guarantees.
const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ctx = testTenantContext(id(100));
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


describe('terminal changed-source refusal normalisation (Sol 3)', () => {
  it('closes a terminal refusal as blocked rather than retaining a failed live effect', async () => {
    const { repo, history } = interrupted('started');
    const service = repo as unknown as { [key: string]: (...args: any[]) => Promise<any> };
    const row = { id: id(6), job_id: id(2), outbox_action_id: id(8), outbox_status: 'dead_letter',
      content_hash: 'a'.repeat(64), approving_membership_id: actor.membershipId };
    service.messageRows = async () => [row];
    const db = { $client: { query: async (sql: string) => {
      if (sql.startsWith('UPDATE app.action_outbox')) return { rows: [], rowCount: 1 };
      if (sql.includes('FROM app.action_outbox')) return { rows: [{ status: 'dead_letter', claimed_at: null }], rowCount: 1 };
      if (sql.includes('FROM app.recovery_message_event')) return { rows: history.map((kind, i) => ({ kind, revision: i + 1, command_id: id(50), request_hash: 'c'.repeat(64), actor_membership_id: actor.membershipId })), rowCount: history.length };
      if (sql.includes('FROM app.action_attempt')) return { rows: [{ id: id(90), attempt_number: 5, outcome: 'failed', error_code: 'FAKE_BLOCKED_CHANGED' }], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    } } };
    await service.finishHistory!(db, ctx.tenantId, id(1));
    expect(row.outbox_status).toBe('cancelled');
    expect(history.at(-1)).toBe('blocked');
  });
});

describe('real evidence-pack command ownership boundary (Sol 4)', () => {
  it.each(['generation', 'attachment approval'])('refuses an id owned by pack %s before recording a recovery effect', async family => {
    const repo = new RecoveryMessageRepository({} as Pool);
    const service = repo as unknown as { [key: string]: (...args: any[]) => Promise<any> };
    service.lockCase = async () => undefined;
    const db = { $client: { query: async (sql: string) => {
      if(sql.includes('app.begin_command('))return {rows:[{result:{kind:'claim'}}],rowCount:1};
      if (sql.includes('pg_advisory')) return { rows: [], rowCount: 1 };
      if (sql.includes('app.evidence_pack_revision') || sql.includes('app.evidence_pack_attachment_approval')) return { rows: [{ family }], rowCount: 1 };
      if (sql.includes('app.recovery_case'))return {rows:[{job_id:id(2)}],rowCount:1};
      if(sql.includes('app.membership'))return {rows:[{}],rowCount:1};
      throw new Error(`Unexpected SQL: ${sql}`);
    } } };
    await expect(service.begin!(db, ctx.tenantId, id(1), id(50), actor, true, { action: 'preview', requestHash: 'c'.repeat(64), requestJson: JSON.stringify({caseId:id(1),membershipId:actor.membershipId}) }))
      .rejects.toMatchObject({ code: 'RECOVERY_MESSAGE_COMMAND_CONFLICT' });
  });
});

describe('blocked replay current-state ruling (Opus P3-1)', () => {
  it('returns current state for a pre-start block without execution or writes', async () => {
    const state = { latest: { status: 'blocked' }, sinkCount: 0 };
    const query = vi.fn(async () => ({ rows: [{ revision: 3, kind: 'blocked' }] }));
    const pool = { connect: async () => ({ query, release() {} }) } as unknown as Pool;
    const repo = new RecoveryMessageRepository(pool);
    const service = repo as unknown as { [key: string]: (...args: any[]) => Promise<any> };
    service.begin = async () => false;
    service.isReplay = async () => ({ kind: 'blocked' });
    service.messageRow = async () => ({ outbox_status: 'cancelled' });
    service.read = async () => state;
    expect(await repo.command(ctx, id(1), { version: 'recovery-message-command.v1', commandId: id(50), messageId: id(6), expectedRevision: 2, action: 'advance', outcome: 'success' }, actor)).toEqual(state);
    expect(query.mock.calls.every(([sql]) => /^(BEGIN|COMMIT|SELECT)/u.test(sql))).toBe(true);
  });
});


describe('LP-5a deferred command refusal mapping', () => {
  it.each([
    ['23514', 'COMMAND_CONFLICT', 'RECOVERY_MESSAGE_COMMAND_CONFLICT'],
    ['23505', 'COMMAND_CONFLICT', 'RECOVERY_MESSAGE_COMMAND_CONFLICT'],
    ['23514', 'unrelated check failure', null],
    ['23505', 'unrelated unique failure', null],
    ['XX000', 'COMMAND_CONFLICT', null],
  ])('maps only the command boundary refusal %s / %s', async (code, message, expected) => {
    const failure = Object.assign(new Error(message), { code });
    const queries: string[] = [];
    const pool = { connect: async () => ({ release() {}, query: async (sql: string) => {
      queries.push(sql);
      if (sql === 'COMMIT') throw failure; // deferred PostgreSQL constraint refusal
      return { rows: [], rowCount: 0 };
    } }) } as unknown as Pool;
    const repo = new RecoveryMessageRepository(pool);
    const service = repo as unknown as { [key: string]: (...args: any[]) => Promise<any> };
    service.lockCase = async () => undefined;
    service.finishHistory = async () => undefined;
    service.state = async () => ({});
    const outcome = repo.read(ctx, id(1));
    if (expected) {
      await expect(outcome).rejects.toBeInstanceOf(RecoveryMessageError);
      await expect(outcome).rejects.toMatchObject({ code: expected });
    } else await expect(outcome).rejects.toBe(failure);
    expect(queries).toContain('ROLLBACK');
  });
});

// LP-5b begin/complete can refuse during the work as well as at deferred commit.
// Exercise each public mapper without masking unrelated PostgreSQL errors.
describe.each(["message", "follow_up"] as const)("LP-5b %s lifecycle refusal contract", family => {
  it.each(["work", "commit"] as const)("keeps typed conflicts from %s", async stage => {
    for (const [code, message, maps] of [["23514", "COMMAND_CONFLICT", true], ["23505", "COMMAND_CONFLICT", true],
      ["XX000", "COMMAND_CONFLICT", false], ["23514", "unrelated check failure", false]] as const) {
      const failure = Object.assign(new Error(message), { code });
      const queries: string[] = [];
      const pool = { connect: async () => ({ release() {}, query: async (sql: string) => {
        queries.push(sql);
        if (stage === "commit" && sql === "COMMIT") throw failure;
        return { rows: [], rowCount: 0 };
      } }) } as unknown as Pool;
      const messages = { read: async () => ({}) } as unknown as RecoveryMessageRepository;
      const repo = family === "message" ? new RecoveryMessageRepository(pool) : new RecoveryFollowUpRepository(pool, messages);
      const service = repo as unknown as { [key: string]: (...args: any[]) => Promise<any> };
      service.lockCase = async () => undefined;
      service.finishHistory = async () => undefined;
      service.settleDueAudits = async () => undefined;
      service.state = async () => { if (stage === "work") throw failure; return {}; };
      const result = repo.read(ctx, id(1));
      if (maps) {
        await expect(result).rejects.toBeInstanceOf(family === "message" ? RecoveryMessageError : RecoveryFollowUpError);
        await expect(result).rejects.toMatchObject({code: family === "message" ? "RECOVERY_MESSAGE_COMMAND_CONFLICT" : "RECOVERY_FOLLOW_UP_COMMAND_CONFLICT"});
      } else await expect(result).rejects.toBe(failure);
      expect(queries).toContain("ROLLBACK");
    }
  });
});

describe("LP-5b foreign recovery case uniform refusal",()=>{
 it("keeps a foreign/missing case opaque before checking replay ownership",async()=>{
  const query=vi.fn(async(_sql:string,..._values:unknown[])=>({rows:[],rowCount:0}));
  await expect(beginRecoveryCommand({$client:{query}} as any,ctx.tenantId,id(50),"recovery.follow_up.advance",JSON.stringify({caseId:id(1),membershipId:actor.membershipId}))).rejects.toThrow("RECOVERY_CASE_NOT_FOUND");
  expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0]?.[0]).toContain("FROM app.recovery_case");
 });
 it.each(["message","follow_up"] as const)("maps missing-case refusal to the established %s code",async family=>{
  const failure=new Error("RECOVERY_CASE_NOT_FOUND");
  const pool={connect:async()=>({release(){},query:async()=>({rows:[],rowCount:0})})} as unknown as Pool;
  const messages={read:async()=>({})} as unknown as RecoveryMessageRepository;
  const repo=family==="message"?new RecoveryMessageRepository(pool):new RecoveryFollowUpRepository(pool,messages);
  const service=repo as unknown as {[key:string]:(...args:any[])=>Promise<any>};
  service.lockCase=async()=>undefined;service.finishHistory=async()=>undefined;service.settleDueAudits=async()=>undefined;
  service.state=async()=>{throw failure;};
  await expect(repo.read(ctx,id(1))).rejects.toMatchObject({code:family==="message"?"RECOVERY_MESSAGE_NOT_FOUND":"RECOVERY_FOLLOW_UP_NOT_FOUND"});
 });
});

it("advance-time refuses a foreign case as not found before owner/replay disclosure or clock work",async()=>{
 const query=vi.fn(async(sql:string)=>{
  if(sql.includes("app.membership")||sql.includes("app.command_receipt")||sql.includes("app.recovery_follow_up_advance"))throw new Error("foreign case reached authority/replay lookup");
  return {rows:[],rowCount:0};
 });
 const pool={connect:async()=>({release(){},query})} as unknown as Pool;
 const advance=vi.fn(async()=>undefined),repo=new RecoveryFollowUpRepository(pool);
 await expect(repo.advanceTime(ctx,id(1),{version:"recovery-follow-up-command.v1",action:"advance_time",commandId:id(50),followUpId:id(6)},actor,advance)).rejects.toMatchObject({code:"RECOVERY_FOLLOW_UP_NOT_FOUND"});
 expect(query.mock.calls.some(([sql])=>sql.includes("FROM app.recovery_case"))).toBe(true);
 expect(advance).not.toHaveBeenCalled();expect(query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
});
