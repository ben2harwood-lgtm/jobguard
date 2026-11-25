// V2-FL guard: every job-bound app table that jobguard_runtime can touch must carry
// a working v2_practice_firm lock, unless a pending slice file still names it.
import { readdirSync, readFileSync } from "node:fs";

const pendingDir = new URL("./pending/", import.meta.url);

export function pendingTables() {
  const tables = new Map();
  for (const file of readdirSync(pendingDir).filter(name => name.endsWith(".json")).sort()) {
    const { slice, tables: names } = JSON.parse(readFileSync(new URL(file, pendingDir), "utf8"));
    for (const name of names) tables.set(name, slice);
  }
  return tables;
}

// Direct: tenant_id + job_id. Indirect: no job_id, with a foreign key into a direct table.
// app.job itself has no job_id; it is the root every other lock joins to.
export async function firmLockCatalog(admin) {
  const { rows } = await admin.query(`
    WITH direct AS (
      SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p')
        AND EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'job_id' AND NOT a.attisdropped)
        AND EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
    ), indirect AS (
      SELECT DISTINCT k.conrelid AS oid FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE k.contype = 'f' AND n.nspname = 'app' AND c.relkind IN ('r', 'p') AND k.confrelid IN (SELECT oid FROM direct)
        AND NOT EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'job_id' AND NOT a.attisdropped)
    ), targets AS (
      SELECT oid, CASE WHEN oid = 'app.job'::regclass THEN 'root' ELSE 'indirect' END AS kind FROM indirect
      UNION ALL SELECT oid, 'direct' FROM direct
    )
    SELECT t.oid::regclass::text AS relation, t.kind, c.relrowsecurity AS rls,
      (SELECT array_agg(DISTINCT k.confrelid::regclass::text ORDER BY k.confrelid::regclass::text) FROM pg_constraint k
       WHERE k.conrelid = t.oid AND k.contype = 'f') AS parents,
      has_table_privilege('jobguard_runtime', t.oid, 'SELECT,INSERT,UPDATE,DELETE') AS runtime_access,
      EXISTS (SELECT FROM pg_policy p WHERE p.polrelid = t.oid AND p.polpermissive
        AND ('jobguard_runtime'::regrole::oid = ANY (p.polroles) OR p.polroles = '{0}')) AS runtime_permissive,
      (SELECT jsonb_build_object('restrictive', NOT p.polpermissive, 'command', p.polcmd::text,
         'roles', (SELECT array_agg(r::regrole::text) FROM unnest(p.polroles) r),
         'using', pg_get_expr(p.polqual, p.polrelid), 'check', pg_get_expr(p.polwithcheck, p.polrelid))
       FROM pg_policy p WHERE p.polrelid = t.oid AND p.polname = 'v2_practice_firm') AS firm_policy
    FROM targets t JOIN pg_class c ON c.oid = t.oid ORDER BY 1`);
  return rows;
}

// The reasons a table is not truly firm-locked (empty when it is).
export function lockProblems(row) {
  const problems = [];
  const policy = row.firm_policy;
  if (!row.rls) problems.push("row security is off, so no policy applies");
  if (!row.runtime_permissive) problems.push("no permissive runtime policy, so zero rows would only look locked");
  if (!policy) return [...problems, "no v2_practice_firm policy"];
  if (!policy.restrictive) problems.push("v2_practice_firm is permissive");
  if (policy.command !== "*") problems.push(`v2_practice_firm covers ${policy.command}, not ALL`);
  if (JSON.stringify(policy.roles) !== JSON.stringify(["jobguard_runtime"])) problems.push("v2_practice_firm is not for jobguard_runtime only");
  const using = policy.using ?? "";
  const table = row.relation.replace(/^app\./u, "");
  const joinsJob = new RegExp(`EXISTS \\(\\s*SELECT\\s+FROM app\\.job j\\s+WHERE \\(\\(j\\.tenant_id = ${table}\\.tenant_id\\) AND \\(j\\.id = ${table}\\.job_id\\)\\)\\)`, "u");
  if (row.kind === "direct" && !joinsJob.test(using)) problems.push("v2_practice_firm does not join app.job on (tenant_id, job_id)");
  // app.job is the root: 2001's rule compares the job's own practice digest with the session's firm.
  if (row.kind === "root" && !/app\.current_firm_profile_key\(\)/u.test(using)) problems.push("app.job's v2_practice_firm does not check the session's firm");
  // An indirect lock must reach the job through a table this one has a foreign key to, matched on this row's columns.
  const joinsParent = (row.parents ?? []).some(parent =>
    new RegExp(`EXISTS \\(\\s*SELECT\\s+FROM ${parent.replace(".", "\\.")} \\w+\\s+WHERE .*= ${table}\\.\\w+\\)`, "su").test(using));
  if (row.kind === "indirect" && !joinsParent) problems.push("v2_practice_firm does not join a parent it has a foreign key to");
  if (policy.check !== null && policy.check !== using) problems.push("v2_practice_firm has a different WITH CHECK");
  return problems;
}

/** Tables that fail the guard, with reasons. Pending slices and tables runtime can't touch pass. */
export async function firmLockFailures(admin) {
  const pending = pendingTables();
  return (await firmLockCatalog(admin))
    .filter(row => row.runtime_access && !pending.has(row.relation))
    .map(row => ({ relation: row.relation, kind: row.kind, problems: lockProblems(row) }))
    .filter(row => row.problems.length > 0);
}
