import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EvidencePackRepository } from "../src/evidence-pack-repository.js";
import { RequestBindingRefusedError } from "../src/request-binding-error.js";
import { authenticatePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let db: JobDoorsDatabase;
let fixture: Awaited<ReturnType<typeof seedEvidencePackFixture>>;
let auth: Awaited<ReturnType<typeof authenticatePracticeSession>>;
let pack: Awaited<ReturnType<EvidencePackRepository["generate"]>>;
const priorEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  db = await jobDoorsDatabase(true);
  await installLegacySyntheticPartyFixtures(db.owner);
  fixture = await seedEvidencePackFixture(db.owner, { practice: true });
  auth = await authenticatePracticeSession(db.runtime, fixture.sessionToken);
  pack = await new EvidencePackRepository(practiceMaterialPool(db.runtime, auth.digest))
    .generate(auth.context, fixture.caseId, { commandId: randomUUID() }, `membership:${auth.membershipId}`);
});
afterAll(async () => {
  try { await db?.close(); }
  finally {
    if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV;
    else process.env.JOBGUARD_ENV = priorEnvironment;
  }
});

type QueryHook = (client: PoolClient, sql: string, values?: unknown[]) => Promise<unknown>;
function observedPool(pool: Pool, hook: QueryHook): Pool {
  return new Proxy(pool, { get(target, key) {
    if (key === "connect") return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(connection, property) {
        if (property === "query") return (sql: string, values?: unknown[]) => hook(connection, sql, values);
        const value = Reflect.get(connection, property);
        return typeof value === "function" ? value.bind(connection) : value;
      } });
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
const approvalInput = () => ({ commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash });
const isCaseLock = (sql: string, values?: unknown[]) => sql.includes("pg_advisory_xact_lock") && values?.[1] === fixture.caseId;
const outcome = <T>(work: Promise<T>) => work.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error: error as Error & { code?: string } }));
function signal() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function binding(xid: string) {
  return (await db.owner.query("SELECT credential_kind,tenant_id,actor_id FROM control_plane.request_binding WHERE transaction_id=$1::xid8", [xid])).rows;
}
async function observeLock(pid: number, blocker: number, kind: "advisory" | "transactionid") {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const row = (await db.owner.query(`SELECT $2::int=ANY(pg_blocking_pids($1)) blocked,
      EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype=$3 AND NOT granted) waiting`, [pid, blocker, kind])).rows[0];
    if (row.blocked && row.waiting) return;
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  throw new Error(`Expected ${kind} lock edge ${pid} -> ${blocker} was not observed`);
}

it("persists the matched request binding for the approval transaction itself, after its case lock", async () => {
  const statements: string[] = [];
  let approvalXid: string | undefined;
  const pool = observedPool(db.runtime, async (client, sql, values) => {
    statements.push(sql);
    const result = await client.query(sql, values);
    if (sql.includes("INSERT INTO app.evidence_pack_attachment_approval")) {
      approvalXid = (await client.query("SELECT pg_current_xact_id()::text xid")).rows[0].xid;
    }
    return result;
  });
  const input = approvalInput();
  const approved = await new EvidencePackRepository(practiceMaterialPool(pool, auth.digest))
    .approveAttachment(auth.context, fixture.caseId, pack.id, input, `membership:${auth.membershipId}`);
  expect(approved.attachmentApprovalRecorded).toBe(true);
  const firstBind = statements.findIndex(sql => sql === "SELECT app.bind_request($1, $2, $3)");
  // The command lock and case lock both precede the first binding call.
  const locks = statements.flatMap((sql, index) => sql.includes("pg_advisory_xact_lock") ? [index] : []);
  expect(locks).toHaveLength(2);
  expect(firstBind).toBeGreaterThan(locks[1]!);
  expect(approvalXid).toBeDefined();
  expect(await binding(approvalXid!)).toEqual([{ credential_kind: "practice", tenant_id: fixture.tenantId, actor_id: auth.membershipId }]);
  expect((await db.owner.query("SELECT command_id FROM app.evidence_pack_attachment_approval WHERE command_id=$1", [input.commandId])).rows)
    .toEqual([{ command_id: input.commandId }]);
});

it("fails closed for the observed approval-case, generate-session and queued-revocation deadlock", async () => {
  const caseHeld = signal(), enterLateBind = signal(), generateStarted = signal();
  const approval = approvalInput(), generation = { commandId: randomUUID() };
  let approvalXid = "", generateXid = "", approvalPid = 0, generatePid = 0;
  let approvalActive = false, generateActive = false, approvalCommitted = false, generateCommitted = false;
  const before = (await db.owner.query(`SELECT
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='evidence_pack.attachment_approved') approval_audits,
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'caseId'=$3 AND event_type='evidence_pack.generated') generation_audits`,
  [fixture.tenantId, pack.id, fixture.caseId])).rows[0];
  const approvalPool = observedPool(db.runtime, async (client, sql, values) => {
    const result = await client.query(sql, values);
    if (isCaseLock(sql, values)) {
      const row = (await client.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text xid")).rows[0];
      approvalPid = row.pid; approvalXid = row.xid; approvalActive = true;
      caseHeld.release(); await enterLateBind.promise;
    }
    if (approvalActive && (sql === "COMMIT" || sql === "ROLLBACK")) {
      approvalCommitted = sql === "COMMIT"; approvalActive = false;
    }
    return result;
  });
  const generatePool = observedPool(db.runtime, async (client, sql, values) => {
    if (isCaseLock(sql, values)) {
      const row = (await client.query("SELECT pg_backend_pid() pid,pg_current_xact_id()::text xid")).rows[0];
      generatePid = row.pid; generateXid = row.xid; generateActive = true; generateStarted.release();
    }
    const result = await client.query(sql, values);
    if (generateActive && (sql === "COMMIT" || sql === "ROLLBACK")) {
      generateCommitted = sql === "COMMIT"; generateActive = false;
    }
    return result;
  });
  const revoker = await db.owner.connect();
  let pendingApproval: ReturnType<typeof outcome> | undefined;
  let pendingGenerate: ReturnType<typeof outcome> | undefined;
  let pendingRevocation: ReturnType<typeof outcome> | undefined;
  try {
    pendingApproval = outcome(new EvidencePackRepository(practiceMaterialPool(approvalPool, auth.digest))
      .approveAttachment(auth.context, fixture.caseId, pack.id, approval, `membership:${auth.membershipId}`));
    await Promise.race([caseHeld.promise, pendingApproval.then(() => { throw new Error("Approval ended before acquiring its case lock"); })]);
    pendingGenerate = outcome(new EvidencePackRepository(practiceMaterialPool(generatePool, auth.digest))
      .generate(auth.context, fixture.caseId, generation, `membership:${auth.membershipId}`));
    await Promise.race([generateStarted.promise, pendingGenerate.then(() => { throw new Error("Generation ended before requesting its case lock"); })]);
    await observeLock(generatePid, approvalPid, "advisory");
    const revokerPid = (await revoker.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
    // Membership-first, then session: the existing deactivation lock order. The
    // granted membership update gives approval a hard dependency on this revoker;
    // a queued session UPDATE alone can be bypassed by compatible row-share locks.
    await revoker.query("BEGIN");
    await revoker.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, auth.membershipId]);
    pendingRevocation = outcome((async () => {
      try {
        const result = await revoker.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [auth.digest]);
        await revoker.query("COMMIT"); return result;
      } catch (error) { await revoker.query("ROLLBACK"); throw error; }
    })());
    await observeLock(revokerPid, generatePid, "transactionid");
    // The session revocation is queued behind generation, while the membership
    // revocation is already written. Approval's existing membership fence closes
    // the cycle; unlike a compatible session SHARE, it cannot bypass that write.
    expect((await db.owner.query(`SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='tuple'
      AND relation='control_plane.practice_session'::regclass AND granted`, [revokerPid])).rowCount).toBe(1);
    enterLateBind.release();
    await observeLock(approvalPid, revokerPid, "transactionid");
    const results = await Promise.all([pendingApproval, pendingGenerate, pendingRevocation]);
    expect(results.some(result => !result.ok && result.error.code === "40P01")).toBe(true);
    const [a, g, r] = results;
    for (const [result, committed] of [[a!, approvalCommitted], [g!, generateCommitted]] as const) {
      if (!result.ok) {
        if (result.error.code === "40P01") expect(committed).toBe(false);
        // Repository methods project through a separate transaction after commit;
        // a later revocation may refuse that projection without undoing the commit.
        expect(result.error.code === "40P01" || result.error.message === "UNAUTHENTICATED" ||
          (committed && result.error instanceof RequestBindingRefusedError)).toBe(true);
      }
    }
    const approvals = (await db.owner.query("SELECT command_id FROM app.evidence_pack_attachment_approval WHERE command_id=$1", [approval.commandId])).rows;
    const generations = (await db.owner.query("SELECT command_id FROM app.evidence_pack_revision WHERE command_id=$1", [generation.commandId])).rows;
    expect(approvals).toHaveLength(approvalCommitted ? 1 : 0);
    expect(generations).toHaveLength(generateCommitted ? 1 : 0);
    expect(await binding(approvalXid)).toEqual(approvalCommitted
      ? [{ credential_kind: "practice", tenant_id: fixture.tenantId, actor_id: auth.membershipId }] : []);
    expect(await binding(generateXid)).toEqual(generateCommitted
      ? [{ credential_kind: "practice", tenant_id: fixture.tenantId, actor_id: auth.membershipId }] : []);
    const after = (await db.owner.query(`SELECT
      (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='evidence_pack.attachment_approved') approval_audits,
      (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'caseId'=$3 AND event_type='evidence_pack.generated') generation_audits`,
    [fixture.tenantId, pack.id, fixture.caseId])).rows[0];
    expect(after).toEqual({ approval_audits: before.approval_audits + Number(approvalCommitted), generation_audits: before.generation_audits + Number(generateCommitted) });
    const session = (await db.owner.query("SELECT revoked_at FROM control_plane.practice_session WHERE token_digest=$1", [auth.digest])).rows[0];
    const membership = (await db.owner.query("SELECT revoked_at FROM app.membership WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, auth.membershipId])).rows[0];
    if (r!.ok) {
      expect(session.revoked_at).not.toBeNull(); expect(membership.revoked_at).not.toBeNull();
      expect(approvalCommitted).toBe(false); expect(a!.ok).toBe(false);
    } else {
      expect(r!.error.code).toBe("40P01"); expect(session.revoked_at).toBeNull(); expect(membership.revoked_at).toBeNull();
      if (a!.ok) expect(approvalCommitted).toBe(true);
    }
  } finally {
    enterLateBind.release();
    if (!pendingRevocation) await revoker.query("ROLLBACK");
    await Promise.all([pendingApproval, pendingGenerate, pendingRevocation]);
    await revoker.query("ROLLBACK"); revoker.release();
  }
});
