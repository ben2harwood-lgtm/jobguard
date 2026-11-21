import type { Pool } from "pg";

/** Check the authenticated database before handing a connection to a pilot repository. */
export async function assertPilotConnection(pool: Pool, connectionString: string): Promise<void> {
  const target = new URL(connectionString);
  const result = await pool.query<{ safe: boolean }>(`
    SELECT current_database() = $1 AND session_user = $2 AND current_user = session_user
      AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
      AND NOT pg_has_role(d.datdba, 'MEMBER')
      AS safe
    FROM pg_roles r JOIN pg_database d ON d.datname = current_database()
    WHERE r.rolname = session_user
  `, [target.pathname.slice(1), target.username]);
  if (result.rows[0]?.safe !== true) throw new Error("PILOT_DATABASE_BINDING_REFUSED");
}
