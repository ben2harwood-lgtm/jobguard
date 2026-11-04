import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { MIGRATION_URLS } from "../src/migrate.js";

export const OUTBOUND_PAUSE_MIGRATION = "0552_commercial_outbound_pause.sql";
/** Today's ActionExecutor reads the outbound pause, so a fixture stopped at an older schema seeds through
 * today's code only with this one migration applied early. It is self-contained and needs only the base roles. */
export async function applyOutboundPause(admin: Pick<Pool, "query">) {
  const url = MIGRATION_URLS.find(item => item.pathname.endsWith(`/${OUTBOUND_PAUSE_MIGRATION}`))!;
  await admin.query(await readFile(url, "utf8"));
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [OUTBOUND_PAUSE_MIGRATION]);
}

// Synthetic suites resume through the real reconciliation/two-person boundary.
export async function pauseOutboundFixture(admin: Pool) {
  const operators: Pool[] = [];
  for (let index = 0; index < 2; index++) {
    const user = `pause_fixture_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
    await admin.query(`CREATE ROLE ${user} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT jobguard_outbound_operator TO ${user}`);
    operators.push(new Pool({ ...admin.options, user, password, max: 1 }));
  }
  const [first, second] = operators as [Pool, Pool];
  const state = (await first.query("SELECT paused,revision FROM outbound_control.state")).rows[0];
  if (state.paused) {
    await Promise.all(operators.map(pool => pool.end()));
    throw new Error("FIXTURE_OUTBOUND_ALREADY_PAUSED");
  }
  await first.query("SELECT outbound_control.command($1,'pause',$2)", [randomUUID(), state.revision]);
  return async () => {
    try {
      const revision = (await first.query("SELECT revision FROM outbound_control.state")).rows[0].revision;
      const request = randomUUID();
      const requested = (await first.query("SELECT outbound_control.command($1,'request_resume',$2) revision", [request, revision])).rows[0].revision;
      await first.query("SELECT outbound_control.record_reconciliation($1,$2)", [request, randomUUID()]);
      await second.query("SELECT outbound_control.command($1,'approve_resume',$2,$3)", [randomUUID(), requested, request]);
    } finally {
      await Promise.all(operators.map(pool => pool.end()));
    }
  };
}
