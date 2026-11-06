import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { MIGRATION_URLS } from "../src/migrate.js";

const foundation = "0562_lp6a_request_binding.sql";
/** Current session-bearing seed clients need the reviewed dark foundation on old schemas,
 * just as current outbound clients need 0552. This is test setup, not a production fallback.
 * Apply the exact migration, retain its checks/grants, and record it so successors do not replay it. */
export async function applyRequestBindingFoundation(admin: Pick<Pool | PoolClient, "query">) {
  const state = (await admin.query(`SELECT to_regprocedure('app.bind_request(text,text,uuid)') IS NOT NULL AS installed,
    to_regprocedure('identity.sso_session_memberships(uuid,uuid)') IS NOT NULL AS ready`)).rows[0];
  if (state.installed || !state.ready) return;
  if ((await admin.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", [foundation])).rowCount)
    throw new Error("Recorded request-binding migration has no binding routine");
  const url = MIGRATION_URLS.find(item => item.pathname.endsWith(`/${foundation}`));
  if (!url) throw new Error("Missing reviewed request-binding fixture migration");
  await admin.query(await readFile(url, "utf8"));
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [foundation]);
}

/** Administrator-only fictional credential for the exact member under test. */
export async function contractorMemberSession(admin: Pool, runtime: Pool, member: import("../src/tenant-context.js").AuthenticatedMembership) {
  const { randomUUID, createHash } = await import("node:crypto");
  const { ContractorRepository } = await import("../src/contractor-repository.js");
  const credential = randomUUID();
  await admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')`,
  [randomUUID(), member.tenantId, member.membershipId, member.identityUserId, createHash("sha256").update(credential).digest("hex")]);
  return new ContractorRepository(runtime).resolveSession(credential);
}
