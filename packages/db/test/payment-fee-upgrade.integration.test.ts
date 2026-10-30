import { afterAll, beforeAll, expect, it } from "vitest";
import { createLockFixture, closeLockFixture, type LockFixture } from "./recovery-attribution-fixture.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";

// Separable comparator controls only. This is NOT the held 0221 own-step proof,
// an application migration, runtime-role test or proof of source qualification.
let fixture: LockFixture | undefined;
const table = "mon4a_proof.existing_row";
const clean = { rows: [], types: [] };
let before: Awaited<ReturnType<typeof proofBefore>>;
beforeAll(async () => {
  fixture = await createLockFixture(false);
  await fixture.admin.query(`CREATE SCHEMA mon4a_proof;
    CREATE TABLE mon4a_proof.existing_row (
      tenant_id uuid NOT NULL, id uuid NOT NULL, received_at timestamptz NOT NULL,
      principal bigint NOT NULL, reference varchar(80) NOT NULL, PRIMARY KEY(tenant_id,id)
    );
    INSERT INTO mon4a_proof.existing_row VALUES
      ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','2026-10-24T12:00:00.123456Z',8000,'Synthetic comparator');
    CREATE FUNCTION mon4a_proof.example() RETURNS integer LANGUAGE sql AS $function$ SELECT 1 $function$;`);
  before = await proofBefore(fixture.admin, [table]);
  expect(Object.keys(before[table]!.rows)).toHaveLength(1);
  expect(before[table]!.key).toEqual(["tenant_id", "id"]);
  expect(await proofDifferences(fixture.admin, before)).toEqual(clean);
}, 60_000);
afterAll(async () => { if (fixture) await closeLockFixture(fixture); });

it("MON4A-S18 comparator detects a one-microsecond change in canonical PostgreSQL text", async () => {
  await rolledBack(fixture!.admin, async db => {
    await db.query(`UPDATE ${table} SET received_at=received_at+interval '1 microsecond'`);
    const diff = await proofDifferences(db, before);
    expect(diff.rows).toHaveLength(1);
    expect(diff.rows[0]).toContain(`${table} `);
    expect(diff.rows[0]).toContain(": changed");
    expect(diff.types).toEqual([]);
  });
  expect(await proofDifferences(fixture!.admin, before)).toEqual(clean);
});
it("MON4A-S18 comparator detects an existing-column retype even when its text is unchanged", async () => {
  await rolledBack(fixture!.admin, async db => {
    await db.query(`ALTER TABLE ${table} ALTER COLUMN reference TYPE text`);
    expect(await proofDifferences(db, before)).toEqual({ rows: [], types: [`${table}: reference character varying(80) -> text`] });
  });
  expect(await proofDifferences(fixture!.admin, before)).toEqual(clean);
});
it("MON4A-S18 comparator permits a later nullable column on a nonfingerprinted fixture", async () => {
  await rolledBack(fixture!.admin, async db => {
    await db.query(`ALTER TABLE ${table} ADD COLUMN later_nullable text`);
    expect(await proofDifferences(db, before)).toEqual(clean);
  });
});
it("MON4A-S18 comparator permits later function replacement", async () => {
  await rolledBack(fixture!.admin, async db => {
    expect(await scratchReplaceFunction(db, "mon4a_proof.example()")).toBe(true);
    expect(await proofDifferences(db, before)).toEqual(clean);
  });
});
it("MON4A-S18 comparator permits a later inserted row while preserving captured primary identities", async () => {
  await rolledBack(fixture!.admin, async db => {
    await db.query(`INSERT INTO ${table} SELECT tenant_id,'a0000000-0000-4000-8000-000000000003',received_at,principal,reference FROM ${table}`);
    expect((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows).toEqual([{ n: 2 }]);
    expect(await proofDifferences(db, before)).toEqual(clean);
  });
  expect(await proofDifferences(fixture!.admin, before)).toEqual(clean);
});
