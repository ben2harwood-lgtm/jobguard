import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditBatch, migrate, verifyAuditChain, withTenant } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const membershipConstraint = "audit_export_tenant_id_actor_membership_id_fkey";
const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
let postgres: EmbeddedPostgres | undefined;
let admin: Pool | undefined;

beforeAll(async () => {
  const databaseDir = await mkdtemp(join(tmpdir(), "jg-later-b22-"));
  const port = await freePort(58400, 300);
  const connection = { host: "127.0.0.1", port, user: "postgres", database: "postgres" };
  const authentication = { password: randomUUID() };
  postgres = new EmbeddedPostgres({
    databaseDir, port, user: "postgres", ...authentication, persistent: false,
    createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined,
  });
  await postgres.initialise();
  await postgres.start();
  admin = new Pool({ ...connection, ...authentication, max: 2 });
  await migrate(admin);
}, 120_000);

afterAll(async () => {
  await closeTestPools(admin);
  await postgres?.stop();
});

type ExportFixture = {
  tenantId: string;
  eventId: string;
  membershipId: string;
  foreignMembershipId: string;
  createdAt: Date;
  headHash: string;
};

async function withFixture(work: (db: PoolClient, fixture: ExportFixture) => Promise<void>) {
  const tenantId = randomUUID(), foreignTenantId = randomUUID();
  const membershipId = randomUUID(), foreignMembershipId = randomUUID();
  await withTenant(admin!, testTenantContext(tenantId), async database => {
    const db = database.$client;
    // These admin-only fixtures exercise relational integrity, not runtime authorization.
    for (const [tenant, member] of [[tenantId, membershipId], [foreignTenantId, foreignMembershipId]]) {
      const accountId = randomUUID(), userId = randomUUID();
      await db.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
      await db.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
      await db.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'LATER-B22 fictional account')", [tenant, accountId]);
      await db.query(`INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role)
        VALUES($1,$2,$3,$4,'owner')`, [tenant, member, accountId, userId]);
    }
    const eventId = randomUUID();
    const events = await appendAuditBatch(database, [{
      id: eventId, version: "audit.v1", actorRef: `membership:${membershipId}`,
      eventType: "audit.export.created", subjectType: "audit_export", subjectRef: eventId,
      payload: { references: { command: eventId }, classifications: { access: "security" } },
    }]);
    expect(events).toHaveLength(1);
    verifyAuditChain(events);
    const event = events[0]!;
    // Prove that the event and both memberships exist, but the foreign member
    // has no relationship to this tenant. No other referenced identity is invalid.
    expect((await db.query(`SELECT
      EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND id=$2) AS event_present,
      EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$3) AS member_present,
      EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=$4 AND id=$5) AS foreign_member_present,
      EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$5) AS foreign_member_in_tenant`,
    [tenantId, eventId, membershipId, foreignTenantId, foreignMembershipId])).rows).toEqual([{
      event_present: true, member_present: true, foreign_member_present: true, foreign_member_in_tenant: false,
    }]);
    await work(db, { tenantId, eventId, membershipId, foreignMembershipId, createdAt: event.occurredAt, headHash: event.eventHash });
  });
}

function insertExport(db: PoolClient, table: string, fixture: ExportFixture, member: string) {
  return db.query(`INSERT INTO ${table}(tenant_id,id,actor_membership_id,created_at,entry_count,head_hash,file)
    VALUES($1,$2,$3,$4,1,$5,$6::jsonb) RETURNING tenant_id,id,actor_membership_id`,
  [fixture.tenantId, fixture.eventId, member, fixture.createdAt, fixture.headHash,
    // Valid for the table's file CHECK; this test does not create a signed export.
    JSON.stringify({ version: "audit-export-file.v1" })]);
}

// The real table and every scratch control call this exact assertion. A savepoint
// keeps a rejected statement from masking later checks with an aborted transaction.
async function assertMembershipFk(db: PoolClient, table: string, fixture: ExportFixture) {
  await db.query("SAVEPOINT membership_proof");
  try {
    await expect(insertExport(db, table, fixture, fixture.foreignMembershipId)).rejects.toMatchObject({
      code: "23503", constraint: membershipConstraint,
    });
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT membership_proof");
    await db.query("RELEASE SAVEPOINT membership_proof");
  }
}

async function scratchCopy(db: PoolClient, name: string, omitMembership: boolean) {
  const table = `app.${quoteIdentifier(name)}`;
  // LIKE copies the actual columns, defaults, checks and unique indexes. PostgreSQL
  // omits foreign keys from LIKE, so copy their current definitions from the catalog.
  await db.query(`CREATE TABLE ${table} (LIKE app.audit_export INCLUDING ALL)`);
  const constraints = (await db.query<{ name: string; definition: string }>(`SELECT conname AS name,
    pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='app.audit_export'::regclass AND contype='f' ORDER BY conname`)).rows;
  expect(constraints.some(constraint => constraint.name === membershipConstraint)).toBe(true);
  for (const constraint of constraints) {
    if (omitMembership && constraint.name === membershipConstraint) continue;
    await db.query(`ALTER TABLE ${table} ADD CONSTRAINT ${quoteIdentifier(constraint.name)} ${constraint.definition}`);
  }
  return table;
}

describe("LATER-B22 audit-export membership proof", () => {
  it("L133 / api-audit-export#1: valid export event with foreign membership fails membership FK", async () => {
    await withFixture(async (db, fixture) => {
      await assertMembershipFk(db, "app.audit_export", fixture);
      expect((await db.query("SELECT id FROM app.audit_export WHERE tenant_id=$1 AND id=$2",
        [fixture.tenantId, fixture.eventId])).rows).toEqual([]);
      // Same event, artifact and other fields; changing only membership makes it valid.
      expect((await insertExport(db, "app.audit_export", fixture, fixture.membershipId)).rows).toEqual([{
        tenant_id: fixture.tenantId, id: fixture.eventId, actor_membership_id: fixture.membershipId,
      }]);
    });
  });

  it("L133 / api-audit-export#1: valid same-tenant membership positive twin persists", async () => {
    await withFixture(async (db, fixture) => {
      await insertExport(db, "app.audit_export", fixture, fixture.membershipId);
      expect((await db.query(`SELECT e.id,e.actor_membership_id FROM app.audit_export e
        JOIN app.audit_event a ON (a.tenant_id,a.id)=(e.tenant_id,e.id)
        JOIN app.membership m ON (m.tenant_id,m.id)=(e.tenant_id,e.actor_membership_id)
        WHERE e.tenant_id=$1 AND e.id=$2`, [fixture.tenantId, fixture.eventId])).rows).toEqual([{
        id: fixture.eventId, actor_membership_id: fixture.membershipId,
      }]);
    });
  });

  it("L133 / api-audit-export#1: the same membership assertion fails when only the scratch relationship is absent", async () => {
    await withFixture(async (db, fixture) => {
      await db.query("SAVEPOINT later_b22_scratch");
      try {
        const intact = await scratchCopy(db, "later_b22_intact", false);
        const omitted = await scratchCopy(db, "later_b22_omitted", true);
        await assertMembershipFk(db, intact, fixture);
        // A successful invalid insert must fail the real assertion, specifically
        // because its promise resolved, rather than because of an unrelated SQL error.
        await expect(assertMembershipFk(db, omitted, fixture)).rejects.toThrow(/promise resolved/u);
        expect((await insertExport(db, omitted, fixture, fixture.foreignMembershipId)).rows).toEqual([{
          tenant_id: fixture.tenantId, id: fixture.eventId, actor_membership_id: fixture.foreignMembershipId,
        }]);
        // The application constraint remains present and rejects the same row afterwards.
        await assertMembershipFk(db, "app.audit_export", fixture);
      } finally {
        await db.query("ROLLBACK TO SAVEPOINT later_b22_scratch");
        await db.query("RELEASE SAVEPOINT later_b22_scratch");
      }
    });
  });
});
