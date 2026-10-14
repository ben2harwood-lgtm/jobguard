import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, authenticatePracticeSession, issuePracticeSession, migrate } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { ValueApplication } from "../../../apps/api/src/value/value.application.js";
import { VariationApplication } from "../../../apps/api/src/variation/variation.application.js";

let pg: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, dir: string;
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 dir = await mkdtemp(join(tmpdir(), "audit-api-value-pg-"));
 const port = await freePort(57000, 500);
 pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await pg.initialise(); await pg.start();
 admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
 await migrate(admin);
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional value audit')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
 // Enable only the existing runtime role in this disposable fixture; no new grant.
 await admin.query("ALTER ROLE jobguard_runtime LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS");
 runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "jobguard_runtime", password: "synthetic" });
}, 60000);
afterAll(async () => {
 vi.unstubAllEnvs(); await closeTestPools(runtime, admin); await pg?.stop();
 if (dir) await rm(dir, { recursive: true, force: true });
});

it.each(["addition", "omission"] as const)("value preserves the approved amount while repricing awaits approval (%s)", async direction => {
 const session = await issuePracticeSession(runtime), stranger = await issuePracticeSession(runtime);
 const auth = await authenticatePracticeSession(runtime, session), parent = randomUUID(), variationId = randomUUID();
 // The real issuer creates a live home fixture with parties and ownership bound
 // at creation. Use it without bypassing any live-job or party guard.
 const jobId = (await admin.query<{ id: string }>("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live' AND practice_scenario='home'", [DEMO_TENANT_ID, auth.digest])).rows[0]!.id;
 await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [parent, DEMO_TENANT_ID, jobId]);
 const variations = new VariationApplication(runtime, session), value = new ValueApplication(runtime, session);
 const price = (unitRatePence: number) => ({ quantity: "1", unit: "item", unitRatePence, direction });
 const proposed = await variations.command(jobId, { version: "variation-command.v1", action: "propose", proposalId: variationId, scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: parent, captureText: "Fictional extra", description: "Fictional extra", price: price(12500) });
 const first = proposed.variations.find(row => row.id === variationId)!.revisions[0]!;
 const approve = (revisionId: string) => variations.command(jobId, { version: "variation-command.v1", action: "approve", variationId, revisionId, approvalId: randomUUID(), attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" });
 await approve(first.id);
 const key = direction === "addition" ? "approvedExtras" : "approvedReductions";
 const initial = (await value.read(jobId))[key];
 expect(initial).toMatchObject({ pence: 12500, sources: [{ id: first.id, revision: 1 }] });
 const secondId = randomUUID();
 await variations.command(jobId, { version: "variation-command.v1", action: "revise", variationId, revisionId: secondId, expectedRevisionId: first.id, description: "Fictional revised price", price: price(15000) });
 const pending = await value.read(jobId);
 expect(pending[key]).toEqual(initial);
 expect(pending.pendingExtras.map(row => ({ id: row.id, revision: row.revision, pence: row.pence }))).toEqual(direction === "addition" ? [{ id: secondId, revision: 2, pence: 15000 }] : []);
 await expect(new ValueApplication(runtime, stranger).read(jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await approve(secondId);
 const approved = await value.read(jobId);
 expect(approved[key]).toMatchObject({ pence: 15000, sources: [{ id: secondId, revision: 2 }] });
 expect(approved[key].sources).toHaveLength(1);
 expect(approved.pendingExtras).toEqual([]);
 // Both exact approvals survive; the projection counts only the latest one.
 expect((await admin.query("SELECT revision_id FROM app.variation_approval WHERE tenant_id=$1 AND variation_id=$2 ORDER BY revision", [DEMO_TENANT_ID, variationId])).rows).toEqual([{ revision_id: first.id }, { revision_id: secondId }]);
});
