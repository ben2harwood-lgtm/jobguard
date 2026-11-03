import { randomUUID } from "node:crypto";
import { Pool } from "pg";

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
