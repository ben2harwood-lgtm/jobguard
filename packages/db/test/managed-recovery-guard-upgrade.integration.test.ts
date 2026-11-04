// Real PostgreSQL proof for CI: no service offering or live data/provider authority.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, expect, it } from "vitest";
import { UserCommandDispatcher } from "../src/commands.js";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { startBeforeMigration, applyMigration } from "./contractor-practice-session-fixtures.js";
import { fixture, newCase, start, command, type Cluster, type Fixture } from "./managed-recovery-fixtures.js";

const own = '0569_managed_recovery_pursuit_guard.sql';
let c: Cluster;
afterAll(async () => { await c?.close(); });

// The public session-bound routine deliberately remains disabled on this database.
// Exercise the private election body as the test owner, with real command/approval
// records, rather than relaxing that independent service-offering gate.
async function elect(f: Fixture, id: string) {
 const input = command(id);
 const contentHash = createHash('sha256').update(['managed-recovery-election-command.v1', f.job, id,
  input.selection.service, input.selection.points, input.termsVersion].join('\n')).digest('hex');
 return new UserCommandDispatcher(c.admin).dispatch(f.context, {
  version: 'command.v1', commandId: input.commandId, commandType: 'managed_recovery.elect',
  semanticKey: `managed-recovery:${f.job}:${id}`, actorMembershipId: f.actor.membershipId,
  subjectType: 'recovery_case', subjectRef: id,
  action: { actionType: 'managed_recovery.elect', recipient: null, contentHash, aggregateRevision: 1,
   amountPence: null, currency: null, policyVersion: input.termsVersion, expiresAt: new Date('2099-01-01T00:00:00Z') },
 }, { mutate: async (db, authorized) => (await db.$client.query(
  'SELECT * FROM app.mon9_elect($1,$2,$3,$4,$5,$6,$7,$8)',
  [f.job, id, f.actor.membershipId, input.commandId, authorized.authorizationId,
   input.selection.service, input.selection.points, input.termsVersion])).rows[0] });
}

it('records pursuit and backfills missed starts on a differently named database, preserving legacy behavior', async () => {
 c = await startBeforeMigration(own, 'jobguard_mon9_guard_test');
 expect((await c.admin.query('SELECT current_database() name')).rows[0].name).toBe('jobguard_mon9_guard_test');
 const f = await fixture(c), other = await fixture(c);
 const old = await newCase(c, f), fresh = await newCase(c, f), owner = await newCase(c, f);
 const untouched = await newCase(c, f), merchant = await newCase(c, f, 'merchant_overcharge');
 const otherOld = await newCase(c, other);
 await start(c, f, old); await start(c, other, otherOld); await start(c, f, merchant);
 const markers = () => c.admin.query('SELECT * FROM app.managed_recovery_pursuit ORDER BY tenant_id,case_id');
 const history = () => c.admin.query('SELECT to_jsonb(e) row FROM app.recovery_case_event e ORDER BY tenant_id,id');
 expect((await markers()).rows).toEqual([]); // Reproduces the predecessor defect.
 const before = (await history()).rows;
 await applyMigration(c, own);
 expect((await history()).rows).toEqual(before);
 const backfilled = (await markers()).rows;
 expect(backfilled.map(r => r.case_id).sort()).toEqual([old, otherOld].sort());
 const sourceTime = (await c.admin.query('SELECT created_at FROM app.recovery_case_event WHERE tenant_id=$1 AND case_id=$2', [f.tenant, old])).rows[0].created_at;
 expect(backfilled.find(r => r.case_id === old)?.started_at).toEqual(sourceTime);
 await expect(elect(f, old)).rejects.toMatchObject({message: 'PURSUIT_ALREADY_STARTED'});
 await expect(elect(other, otherOld)).rejects.toMatchObject({message: 'PURSUIT_ALREADY_STARTED'});
 // A positive control proves that refusal is pursuit-specific, not a blanket block.
 expect(await elect(f, untouched)).toMatchObject({caseId: untouched, election: {selection: {points: 5}}});
 await start(c, f, fresh);
 expect((await markers()).rows.map(r => r.case_id)).toContain(fresh);
 await expect(elect(f, fresh)).rejects.toMatchObject({message: 'PURSUIT_ALREADY_STARTED'});
 // Legacy owner inserts with no tenant context remain compatible. Their immutable
 // source facts must still prevent election even before a backfill runs.
 const db = await c.admin.connect();
 try {
  await db.query('BEGIN'); await db.query("SELECT set_config('app.tenant_id','',true)");
  await start(c, f, owner, db); await db.query('COMMIT');
 } finally { await db.query('ROLLBACK'); db.release(); }
 expect((await markers()).rows.map(r => r.case_id)).not.toContain(owner);
 await expect(elect(f, owner)).rejects.toMatchObject({message: 'PURSUIT_ALREADY_STARTED'});
 await expect(elect(f, merchant)).rejects.toMatchObject({message: 'MANAGED_RECOVERY_FORBIDDEN'});
 const sql = await readFile(MIGRATION_URLS.find(u => u.pathname.endsWith(own))!, 'utf8');
 await c.admin.query(sql); // Explicit SQL replay, not just migration bookkeeping.
 const replayed = (await markers()).rows;
 expect(replayed.map(r => r.case_id).sort()).toEqual([old, otherOld, fresh, owner].sort());
 for (const row of backfilled) expect(replayed).toContainEqual(row);
 await c.admin.query(sql); await migrate(c.admin);
 expect((await markers()).rows).toEqual(replayed);
 expect((await c.admin.query("SELECT has_function_privilege('jobguard_runtime','app.mon9_elect(uuid,uuid,uuid,uuid,uuid,text,integer,text)','EXECUTE') allowed")).rows).toEqual([{allowed:false}]);
 expect((await c.admin.query('SELECT app.mon9_session($1,$2) actor', [f.sessionDigest,f.actor.membershipId])).rows).toEqual([{actor:null}]);
}, 120000);
