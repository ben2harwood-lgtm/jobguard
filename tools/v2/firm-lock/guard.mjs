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
      (SELECT jsonb_agg(jsonb_build_object('parent', k.confrelid::regclass::text, 'pairs',
         (SELECT jsonb_agg(jsonb_build_array(ca.attname, pa.attname) ORDER BY x.n)
          FROM unnest(k.conkey, k.confkey) WITH ORDINALITY AS x(child, parent, n)
          JOIN pg_attribute ca ON ca.attrelid = k.conrelid AND ca.attnum = x.child
          JOIN pg_attribute pa ON pa.attrelid = k.confrelid AND pa.attnum = x.parent)))
       FROM pg_constraint k WHERE k.conrelid = t.oid AND k.contype = 'f') AS foreign_keys,
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

// A small parser for pg_get_expr output. A lock only counts when its joins are mandatory: the expression
// must be nothing but EXISTS joins combined with AND, and each join nothing but column equalities.
const squash = text => text.replace(/\s+/gu, " ").replace(/\( /gu, "(").replace(/ \)/gu, ")").trim();

function closeOf(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    if (text[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

function unwrap(text) {
  let out = text.trim();
  while (out.startsWith("(") && closeOf(out, 0) === out.length - 1) out = out.slice(1, -1).trim();
  return out;
}

// Split on a keyword at parenthesis depth 0 only.
function splitTop(text, keyword) {
  const parts = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") depth -= 1;
    else if (depth === 0 && text.startsWith(` ${keyword} `, i)) { parts.push(text.slice(last, i)); last = i + keyword.length + 2; }
  }
  return [...parts, text.slice(last)].map(unwrap);
}

/** The EXISTS joins of a lock as [{ parent, pairs: [[child, parentKey]] }], or null when any part is optional or extra. */
export function mandatoryJoins(expression, table) {
  const joins = [];
  for (const conjunct of splitTop(unwrap(squash(expression)), "AND")) {
    const exists = conjunct.match(/^EXISTS \(SELECT FROM (\S+) (\w+) WHERE (.*)\)$/u);
    if (!exists || closeOf(conjunct, "EXISTS ".length) !== conjunct.length - 1) return null;
    const [, parent, alias, where] = exists;
    const pairs = [];
    for (const condition of splitTop(unwrap(where), "AND")) {
      const equal = condition.match(/^(\w+)\.(\w+) = (\w+)\.(\w+)$/u);
      if (!equal || equal[1] !== alias || equal[3] !== table) return null;
      pairs.push([equal[4], equal[2]]);
    }
    joins.push({ parent, pairs });
  }
  return joins;
}

const samePairs = (a, b) => a.length === b.length && a.every(([c, k]) => b.some(([c2, k2]) => c === c2 && k === k2));

// app.job's own lock, exactly as 2001 writes it.
const ROOT_LOCK = "((practice_session_digest IS NULL) OR (app.current_firm_profile_key() = ('practice:'::text || (practice_session_digest)::text)))";

// The foreign keys into job-bound parents that no mandatory join matches exactly (empty when all are).
// Each must read a firm-locked parent: a row naming two jobs (job_link) needs both to be visible.
function unmatchedParentKeys(row, joins, jobBound, lockedParents) {
  const keys = (row.foreign_keys ?? []).filter(({ parent }) => jobBound.has(parent));
  const matched = keys.filter(({ parent, pairs }) => lockedParents.has(parent)
    && joins.some(join => join.parent === parent && samePairs(join.pairs, pairs)));
  // A key whose columns sit inside a matched key is covered by it (job_link's job ids sit inside its binding keys).
  const covered = ({ pairs }) => matched.some(other => pairs.every(([child]) => other.pairs.some(([c]) => c === child)));
  return keys.filter(key => !covered(key)).map(({ parent, pairs }) => `${parent}(${pairs.map(([child]) => child).join(", ")})`);
}

// The reasons a table is not truly firm-locked (empty when it is).
// jobBound: every catalog relation. lockedParents: those that carry a v2_practice_firm policy themselves.
export function lockProblems(row, lockedParents = new Set(), jobBound = lockedParents) {
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
  const joins = row.kind === "root" ? [] : mandatoryJoins(using, table);
  if (joins === null) problems.push("v2_practice_firm is not only mandatory EXISTS joins on column equalities (an OR or extra condition)");
  if (row.kind === "direct" && joins && !(joins.length === 1 && joins[0].parent === "app.job"
    && samePairs(joins[0].pairs, [["tenant_id", "tenant_id"], ["job_id", "id"]]))) {
    problems.push("v2_practice_firm does not join app.job on (tenant_id, job_id)");
  }
  // app.job is the root: 2001's rule compares the job's own practice digest with the session's firm.
  if (row.kind === "root" && squash(using) !== squash(ROOT_LOCK)) problems.push("app.job's v2_practice_firm is not 2001's firm rule");
  // An indirect lock must reach the job through a firm-locked parent it has a foreign key to, on that key's every column.
  if (row.kind === "indirect" && joins) {
    const unmatched = unmatchedParentKeys(row, joins, jobBound, lockedParents);
    if (unmatched.length > 0) problems.push(`v2_practice_firm does not join every job-bound parent on its full key: ${unmatched.join("; ")}`);
  }
  if (policy.check !== null && policy.check !== using) problems.push("v2_practice_firm has a different WITH CHECK");
  return problems;
}

/** Tables that fail the guard, with reasons. Pending slices and tables runtime can't touch pass. */
export async function firmLockFailures(admin) {
  const pending = pendingTables();
  const catalog = await firmLockCatalog(admin);
  const lockedParents = new Set(catalog.filter(row => row.firm_policy).map(row => row.relation));
  const jobBound = new Set(catalog.map(row => row.relation));
  return catalog
    .filter(row => row.runtime_access && !pending.has(row.relation))
    .map(row => ({ relation: row.relation, kind: row.kind, problems: lockProblems(row, lockedParents, jobBound) }))
    .filter(row => row.problems.length > 0);
}
