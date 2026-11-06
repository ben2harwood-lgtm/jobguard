// RED LATER-SAFETY-112: real PostgreSQL and a restricted worker login.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closeFinalCheckFixture, createFinalCheckFixture, type FinalCheckFixture } from "./final-check-fixture.js";

let fixture: FinalCheckFixture | undefined;
let infrastructure: Pool | undefined;
const lockId = randomUUID(), tenantId = randomUUID(), jobId = randomUUID();

beforeAll(async () => {
  // The shared fixture migrates an empty embedded PostgreSQL database through 0841.
  fixture = await createFinalCheckFixture();
  const login = `final_check_infra_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
  await fixture.admin.query(`DO $body$ BEGIN EXECUTE format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
    '${login}', '${password}'); END $body$`);
  await fixture.admin.query(`GRANT jobguard_infrastructure TO ${login}`);
  infrastructure = new Pool({ ...fixture.runtime.options, user: login, password });
  // Owner-only synthetic setup; neither INSERT nor identity writes belong to the worker.
  await fixture.admin.query(
    "INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id) VALUES($1,$2,$3)",
    [lockId, tenantId, jobId],
  );
}, 120_000);

afterAll(async () => {
  await infrastructure?.end();
  await closeFinalCheckFixture(fixture);
});

it("preserves SELECT, row locking and the worker's enqueued_at acknowledgement", async () => {
  const client = await infrastructure!.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      "SELECT lock_id,tenant_id,job_id FROM infrastructure.final_check_request WHERE enqueued_at IS NULL ORDER BY requested_at LIMIT 100 FOR UPDATE SKIP LOCKED",
    );
    expect(selected.rows).toContainEqual({ lock_id: lockId, tenant_id: tenantId, job_id: jobId });
    expect((await client.query(
      "UPDATE infrastructure.final_check_request SET enqueued_at=clock_timestamp() WHERE lock_id=$1",
      [lockId],
    )).rowCount).toBe(1);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const row = (await infrastructure!.query(
    "SELECT * FROM infrastructure.final_check_request WHERE lock_id=$1", [lockId],
  )).rows[0];
  expect(row).toMatchObject({ lock_id: lockId, tenant_id: tenantId, job_id: jobId });
  expect(row.enqueued_at).toBeInstanceOf(Date);
});

it.each(["lock_id", "tenant_id", "job_id", "requested_at"] as const)(
  "refuses worker rewrites of %s with 42501 and leaves the row unchanged",
  async column => {
    const before = (await fixture!.admin.query(
      "SELECT * FROM infrastructure.final_check_request WHERE lock_id=$1", [lockId],
    )).rows;
    // Column names come only from the fixed allowlist above, never from input.
    await expect(infrastructure!.query(
      `UPDATE infrastructure.final_check_request SET ${column}=$1 WHERE lock_id=$2`,
      [column === "requested_at" ? "2000-01-01T00:00:00Z" : randomUUID(), lockId],
    )).rejects.toMatchObject({ code: "42501" });
    expect((await fixture!.admin.query(
      "SELECT * FROM infrastructure.final_check_request WHERE lock_id=$1", [lockId],
    )).rows).toEqual(before);
  },
);
