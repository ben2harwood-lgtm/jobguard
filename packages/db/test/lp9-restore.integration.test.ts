import { execFileSync } from "node:child_process";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import * as api from "../src/index.js";
import { runSyntheticRestoreRehearsal } from "../tools/synthetic-restore.mjs";
import { adoptionFixture, jobDoorCounts, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { gateCatalog, gateContext, gateMigrationEvidence, gatePrincipal, gateQueuedAction, gateRefusal, type GatePrincipal } from "./lp9-final-gate-fixtures.js";

type Hook = { admin: Pool; pool: (user: string, database?: string) => Pool };
type Adoption = Awaited<ReturnType<typeof adoptionFixture>>;
type Queued = Awaited<ReturnType<typeof gateQueuedAction>>;

it("restores the final catalogue and rechecks stale sessions, membership, expired approvals and completed work before resumption", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  let catalog: unknown, migrations: unknown, fixture: Adoption, valid: GatePrincipal;
  let revokedSession: GatePrincipal, expiredSession: GatePrincipal, revokedMember: GatePrincipal;
  let expired: Queued, revoked: Queued, completed: Queued;
  let attempts: unknown, committedCounts: unknown, completedToken: string;
  try {
    const receipt = await runSyntheticRestoreRehearsal({ environment: "synthetic_demo" }, api, {
      async beforeBackup({ admin, pool }: Hook) {
        const runtime = pool("rehearsal_runtime"), worker = pool("rehearsal_worker");
        fixture = await adoptionFixture({ owner: admin, runtime } as JobDoorsDatabase);
        valid = await gatePrincipal(admin, fixture.actor);
        revokedSession = await gatePrincipal(admin); expiredSession = await gatePrincipal(admin); revokedMember = await gatePrincipal(admin);
        // First prove these exact synthetic credentials work, and leave a committed
        // old request-binding row for the restart boundary to invalidate.
        for (const p of [valid, revokedSession, expiredSession, revokedMember]) {
          const c = await runtime.connect();
          try {
            await c.query("BEGIN"); await c.query("SELECT app.bind_request('real',$1,$2)", [p.credential, p.tenant]);
            expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(p.member);
            await c.query("COMMIT");
          } finally { await c.query("ROLLBACK"); c.release(); }
        }
        expect((await admin.query("SELECT count(*)::int n FROM control_plane.request_binding")).rows[0].n).toBeGreaterThan(0);
        expired = await gateQueuedAction(admin, runtime, valid);
        completed = await gateQueuedAction(admin, runtime, valid);
        revoked = await gateQueuedAction(admin, runtime, revokedMember);
        // Exercise a legitimate claim/completion before backup; subsequent replay
        // must retain its one committed attempt and checked worker history.
        const claim = (await worker.query("SELECT app.claim_worker_action($1,ARRAY['fake_lp9']) value", [completed.id])).rows[0].value;
        expect(claim).toMatchObject({ token: expect.any(String), attempt: 1 });
        completedToken = claim.token;
        expect((await worker.query("SELECT app.complete_worker_action($1,$2,'succeeded','fictional-lp9',NULL) value", [completed.id, claim.token])).rows[0].value).toBe(true);
        await admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [revokedSession.sessionId]);
        await admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [expiredSession.sessionId]);
        await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [revokedMember.tenant, revokedMember.member]);
        // Administrative fixture ageing, never a product operation or a real approval.
        const owner = await admin.connect();
        try {
          await owner.query("BEGIN");
          await owner.query("SET LOCAL session_replication_role=replica");
          await owner.query("UPDATE app.action_authorization SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [expired.authorization]);
          await owner.query("UPDATE app.action_outbox SET authorization_expires_at=(SELECT expires_at FROM app.action_authorization WHERE id=$2) WHERE id=$1", [expired.id, expired.authorization]);
          await owner.query("COMMIT");
        } catch (error) { await owner.query("ROLLBACK"); throw error; } finally { owner.release(); }
        attempts = (await admin.query("SELECT * FROM app.action_attempt WHERE action_id=ANY($1::uuid[]) ORDER BY id", [[expired.id, revoked.id, completed.id]])).rows;
        committedCounts = await jobDoorCounts(admin, valid.tenant);
        catalog = await gateCatalog(admin); migrations = await gateMigrationEvidence(admin);
      },
      async afterRestore({ admin, pool }: Hook) {
        expect(await gateCatalog(admin)).toEqual(catalog);
        expect(await gateMigrationEvidence(admin)).toEqual(migrations);
        const runtime = pool("rehearsal_runtime"), worker = pool("rehearsal_worker"), c = await runtime.connect();
        try {
          expect((await c.query("SELECT session_user,current_user")).rows).toEqual([{ session_user: "rehearsal_runtime", current_user: "rehearsal_runtime" }]);
          await c.query("BEGIN");
          for (const fn of ["current_actor", "current_tenant"]) await gateRefusal(c, `SELECT app.${fn}()`, [], "REQUEST_BINDING_REFUSED");
          for (const p of [revokedSession, expiredSession, revokedMember]) {
            await gateRefusal(c, "SELECT app.bind_request('real',$1,$2)", [p.credential, p.tenant], "REQUEST_BINDING_REFUSED");
          }
          await c.query("SELECT app.bind_request('real',$1,$2)", [valid.credential, valid.tenant]);
          expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(valid.member);
          await c.query("COMMIT");
        } finally { await c.query("ROLLBACK"); c.release(); }
        const w = await worker.connect();
        try {
          expect((await w.query("SELECT session_user,current_user")).rows).toEqual([{ session_user: "rehearsal_worker", current_user: "rehearsal_worker" }]);
          await w.query("BEGIN");
          for (const action of [expired, revoked]) await gateRefusal(w, "SELECT app.bind_worker_action($1)", [action.id], "WORKER_ACTION_REFUSED");
          // Binding a still-valid completed action is not execution permission.
          await w.query("SELECT app.bind_worker_action($1)", [completed.id]);
          await w.query("COMMIT");
        } finally { await w.query("ROLLBACK"); w.release(); }
        expect((await worker.query("SELECT app.complete_worker_action($1,$2,'succeeded','fictional-replay',NULL) value", [completed.id, completedToken])).rows[0].value).toBe(false);
        expect((await admin.query("SELECT outcome,provider_reference FROM app.action_attempt WHERE action_id=$1", [completed.id])).rows).toEqual([{ outcome: "succeeded", provider_reference: "fictional-lp9" }]);
        expect((await admin.query("SELECT * FROM app.action_attempt WHERE action_id=ANY($1::uuid[]) ORDER BY id", [[expired.id, revoked.id, completed.id]])).rows).toEqual(attempts);
        expect(await jobDoorCounts(admin, valid.tenant)).toEqual(committedCounts);
        // Positive command crosses binding, command, immutable baseline and audit
        // after reconnect; inspect committed state from the independent owner pool.
        const dispatcher = new api.UserCommandDispatcher(runtime);
        const result = await dispatcher.dispatch(gateContext(valid), fixture.command,
          new api.AdoptInFlightJobMutation(valid.tenant, "synthetic_candidate", fixture.input));
        expect(result).toMatchObject({ jobId: fixture.input.jobId, baselineId: fixture.input.baselineId });
        expect((await admin.query("SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [valid.tenant, fixture.command.commandId])).rows).toEqual([{ status: "succeeded" }]);
        console.info("LP-9 restored catalogue/refusals", { applicationCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), migrations, topology: "isolated cold-copy cluster; identity and business co-located" });
      },
    });
    // Existing rehearsal owns paused restore, controlled fake resume, replay and
    // unknown-outcome checks. Its actual executor sees our actions too only when
    // explicitly asked; check them after the rehearsal's resume via a hook seam
    // is unavailable, so do not claim expired/completed claim-after-resume here.
    expect(receipt.result).toBe("PASS");
    expect(receipt.checks.every((c: { status: string }) => c.status === "PASS")).toBe(true);
    expect(receipt.fakeDeliveryCallsAfterRestore).toBe(1);
    expect(receipt.liveProviderCalls).toBe(0);
    expect(receipt.releaseDecision).toBe("NOT_AUTHORIZED");
    console.info("LP-9 inherited restore evidence", receipt);
  } finally { vi.unstubAllEnvs(); }
}, 300_000);
