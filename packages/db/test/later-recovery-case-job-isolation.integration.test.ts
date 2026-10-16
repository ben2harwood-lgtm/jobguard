// Tests first. PostgreSQL execution is reserved for CI: this sandbox cannot bind sockets.
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, RecoveryCaseRepository } from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tenantId = randomUUID(), context = testTenantContext(tenantId);
const actor = { membershipId: randomUUID(), identityUserId: randomUUID() };
let postgres: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool;
let port: number;
const connection = (user: string) => ({ host: "127.0.0.1", port, database: "postgres", user, password: "synthetic" });

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "jg-later-b21-"));
  port = await freePort(60000, 200);
  postgres = new EmbeddedPostgres({
    databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined,
  });
  await postgres.initialise();
  await postgres.start();
  admin = new Pool(connection("postgres"));
  await migrate(admin);
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [actor.identityUserId]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$1,'LATER-B21 synthetic account')", [tenantId]);
  await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
    VALUES($1,$2,$2,$3,'owner')`, [actor.membershipId, tenantId, actor.identityUserId]);
  await admin.query(`CREATE ROLE later_b21_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    GRANT jobguard_runtime TO later_b21_login`);
  runtime = new Pool(connection("later_b21_login"));
}, 60_000);

afterAll(async () => {
  await closeTestPools(runtime, admin);
  await postgres?.stop();
});

async function populatedJobs() {
  const jobIds = [randomUUID(), randomUUID()] as const;
  await admin.query(`INSERT INTO app.job(id,tenant_id,title)
    VALUES($1,$3,'LATER-B21 synthetic job A'),($2,$3,'LATER-B21 synthetic job B')`, [...jobIds, tenantId]);
  const repository = new RecoveryCaseRepository(runtime);
  const cases = [];
  for (const jobId of jobIds) {
    cases.push(await repository.command(context, jobId, {
      version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), expectedRevision: 0,
      caseType: "withheld_customer_payment", claimedNetPence: 32000, counterparty: "Fictional Customer",
      book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"],
    }, actor));
  }
  expect(cases).toHaveLength(2);
  expect(cases[0]!.id).not.toBe(cases[1]!.id);
  for (const [index, jobId] of jobIds.entries()) {
    expect(await repository.listForMember(context, jobId, actor)).toEqual([cases[index]]);
    expect(cases[index]).toMatchObject({ jobId, state: "identified", revision: 2, claimedNetPence: 32000 });
  }
  return { repository, jobIds, cases };
}

type Fixture = Awaited<ReturnType<typeof populatedJobs>>;
const transition = (record: Fixture["cases"][number]) => ({
  version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(),
  caseId: record.id, eventType: "assemble_evidence", expectedRevision: record.revision,
});

// Canonical server text preserves every stored time digit. Tenant-wide snapshots also
// catch a mislinked row on either job, an unexpected new case, or an audit-only effect.
async function effects() {
  const result: Record<string, string[]> = {};
  for (const table of [
    "app.job", "app.recovery_case", "app.recovery_case_current", "app.recovery_claim_revision",
    "app.recovery_case_event", "app.recovery_eligibility_revision", "app.audit_event",
    "audit_control.audit_head", "app.command_receipt", "app.action_outbox",
  ]) {
    result[table] = (await admin.query<{ value: string }>(
      `SELECT row_to_json(t)::text AS value FROM ${table} t WHERE tenant_id=$1 ORDER BY value`, [tenantId],
    )).rows.map(row => row.value);
  }
  return result;
}

// Both the real repository proof and its omitted-predicate control call this exact
// assertion. Another database refusal (for example a composite FK) is not a pass.
async function assertCaseNotFound(attempt: Promise<unknown>) {
  await expect(attempt).rejects.toEqual(new Error("RECOVERY_CASE_NOT_FOUND"));
}

describe("LATER-B21 populated recovery-case job isolation", () => {
  it.each([0, 1] as const)("[L115/dbsrc-11#7] existing same-tenant foreign-job case is refused (target %i), with no effects and a valid positive twin", async index => {
    const f = await populatedJobs(), own = f.cases[index]!, foreign = f.cases[1 - index]!;
    const input = transition(foreign), before = await effects();
    await assertCaseNotFound(f.repository.command(context, own.jobId, input, actor));
    expect(await effects()).toEqual(before);
    // Reuse the refused command verbatim on its owning job: authority, revision,
    // transition and command identity are valid, and the refusal reserved nothing.
    const accepted = await f.repository.command(context, foreign.jobId, input, actor);
    expect(accepted).toMatchObject({ id: foreign.id, jobId: foreign.jobId, state: "evidence_assembled", revision: foreign.revision + 1 });
    expect(await f.repository.listForMember(context, own.jobId, actor)).toEqual([own]);
    expect(await f.repository.listForMember(context, foreign.jobId, actor)).toEqual([accepted]);
    expect((await admin.query(`SELECT job_id,case_id,event_type FROM app.recovery_case_event
      WHERE tenant_id=$1 AND command_id=$2`, [tenantId, input.commandId])).rows)
      .toEqual([{ job_id: foreign.jobId, case_id: foreign.id, event_type: "assemble_evidence" }]);
  });

  it("[L115/dbsrc-11#7] the same refusal assertion detects omission of the real repository lookup's job predicate", async () => {
    const f = await populatedJobs(), own = f.cases[0]!, foreign = f.cases[1]!;
    const input = transition(foreign), before = await effects();
    const controlPool = new Pool(connection("later_b21_login"));
    const observed: string[] = [];
    // This is the repository's actual SELECT on a real PostgreSQL connection, not
    // a parallel fixture model. All membership, tenant and FK checks stay intact.
    const lookup = "SELECT * FROM app.recovery_case_current WHERE tenant_id=$1 AND job_id=$2 AND id=$3 AND claim_revision IS NOT NULL";
    controlPool.on("connect", (client: PoolClient) => {
      const query = client.query.bind(client);
      const intercepted = (async (text: string, values?: unknown[]) => {
        if (text !== lookup) return query(text, values);
        // Renumber the case parameter so only the job qualification is removed.
        const result = await query(text.replace(" AND job_id=$2", "").replace("id=$3", "id=$2"), [values![0], values![2]]);
        observed.push(...result.rows.map(row => row.id as string));
        return result;
      }) as PoolClient["query"];
      vi.spyOn(client, "query").mockImplementation(intercepted);
    });
    try {
      // The remaining composite FK refuses the cross-job event (23503), so the
      // strengthened assertion must fail instead of accepting any rejection.
      let failure: unknown;
      await expect(assertCaseNotFound(new RecoveryCaseRepository(controlPool)
        .command(context, own.jobId, input, actor).catch(error => {
          failure = error;
          throw error;
        }))).rejects.toMatchObject({ name: "AssertionError" });
      expect(observed).toEqual([foreign.id]);
      expect(failure).toMatchObject({ code: "23503" });
    } finally {
      await closeTestPools(controlPool);
    }
    expect(await effects()).toEqual(before);
    // The ordinary repository still refuses after the isolated control is closed.
    await assertCaseNotFound(f.repository.command(context, own.jobId, input, actor));
    expect(await effects()).toEqual(before);
  });
});
