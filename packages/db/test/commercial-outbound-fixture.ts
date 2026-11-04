import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/** Restore the test latch through the real reconciliation/second-operator path. */
export async function resumeSyntheticOutbound(admin: Pool): Promise<void> {
  const client = await admin.connect();
  const request = randomUUID();
  try {
    for (const role of ["pause_fixture_operator_a", "pause_fixture_operator_b"]) {
      await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}') THEN
        CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
        END IF; END $$; GRANT jobguard_outbound_operator TO ${role}`);
    }
    await client.query("SET SESSION AUTHORIZATION pause_fixture_operator_a");
    const revision = (await client.query("SELECT revision FROM outbound_control.state")).rows[0].revision;
    const requested = (await client.query("SELECT outbound_control.command($1,'request_resume',$2) revision", [request, revision])).rows[0].revision;
    await client.query("SELECT outbound_control.record_reconciliation($1,$2)", [request, randomUUID()]);
    await client.query("RESET SESSION AUTHORIZATION");
    await client.query("SET SESSION AUTHORIZATION pause_fixture_operator_b");
    await client.query("SELECT outbound_control.command($1,'approve_resume',$2,$3)", [randomUUID(), requested, request]);
  } finally {
    await client.query("RESET SESSION AUTHORIZATION");
    client.release();
  }
}
