import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/** Real operator logins and the full pause/reconciliation/two-person resume path. */
export async function pauseCommercialOutbound(admin: Pool): Promise<() => Promise<void>> {
 const operators: Pool[] = [];
 try {
  for (let n = 0; n < 2; n++) {
   const user = `pause_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
   await admin.query(`CREATE ROLE ${user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_outbound_operator TO ${user}`);
   operators.push(new Pool({ ...admin.options, user, password }));
  }
  const [requester, approver] = operators as [Pool, Pool];
  const state = (await requester.query("SELECT paused,revision FROM outbound_control.state")).rows[0];
  if (state.paused) throw new Error("Outbound pause fixture requires enabled claims");
  const paused = (await requester.query("SELECT outbound_control.command($1,'pause',$2) revision", [randomUUID(), state.revision])).rows[0].revision;
  return async () => {
   try {
    const request = randomUUID();
    const requested = (await requester.query("SELECT outbound_control.command($1,'request_resume',$2) revision", [request, paused])).rows[0].revision;
    // Synthetic receipt for these fake adapters: paused execution made no attempts.
    await requester.query("SELECT outbound_control.record_reconciliation($1,$2)", [request, randomUUID()]);
    await approver.query("SELECT outbound_control.command($1,'approve_resume',$2,$3)", [randomUUID(), requested, request]);
   } finally { await Promise.all(operators.map(pool => pool.end())); }
  };
 } catch (error) {
  await Promise.all(operators.map(pool => pool.end()));
  throw error;
 }
}
