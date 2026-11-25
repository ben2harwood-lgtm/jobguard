// Q40 / FL-F: report only. Candidate discovery is deliberately broader than V2.
// Source names are leads; only pg_proc establishes overloads, ownership and EXECUTE.
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(path) : [path];
  });
}

export function sourceCandidates() {
  const callers = new Map();
  for (const file of ["apps/api/src", "packages/db/src", "apps/web/app"].flatMap(files)
    .filter(path => path.endsWith(".ts") && !/\.(test|spec)\.ts$/u.test(path))) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        for (const match of node.text.matchAll(/\bapp\.[a-z_][a-z_0-9]*\s*\(/gu)) {
          const name = match[0].replace(/\s*\($/u, "");
          const location = `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
          if (!callers.has(name)) callers.set(name, new Set());
          callers.get(name).add(location);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return callers;
}

export const assessments = {
  "app.require_current_job_parties": {
    classification: "gap", proof: "FL-F parties", jobRows: "job, job_party_current, job_party_snapshot",
    reason: "Bound tenant only; 0749 lines 67-83; no firm comparison before returning the party snapshot.",
  },
  "app.require_watchdog_live": {
    classification: "gap", proof: "FL-F lifecycle", jobRows: "job",
    reason: "Bound tenant only; 0749 lines 87-108; success discloses live status and acquires the job lock.",
  },
  "app.transition_scope_progress": {
    classification: "refused as probed; other paths unclear", proof: "FL-F progress (observed refusal)", jobRows: "scope_progress",
    reason: "Body checks the tenant only (0749 lines 9-30), but the scope_progress write guard (0765) runs the work-state authorization (practice-session job ownership). Live: firm B refused 42501 WORK_STATE_FORBIDDEN, row unchanged. Not a safety proof for other callers or paths.",
  },
  "app.job_saved_firm_name": {
    classification: "safe", proof: "source inspection: 0757 lines 46-71", jobRows: "job",
    reason: "Compares the bound current_firm_profile_key with final_check_job_scope before returning a name; no live proof claimed.",
  },
};

// Read actual installed functions, including non-app helpers reached through pg_depend.
// No prosrc, credentials, row values or personal data are printed by the seed report.
export async function functionCatalog(admin) {
  const { rows } = await admin.query(`SELECT p.oid::text AS oid, n.nspname AS schema,
    p.proname AS name, p.oid::regprocedure::text AS signature,
    p.prosecdef AS definer, p.proowner::regrole::text AS owner,
    has_function_privilege('jobguard_runtime', p.oid, 'EXECUTE') AS runtime_execute,
    p.prosrc AS source, p.proconfig AS configuration,
    coalesce((SELECT array_agg(d.refobjid::text) FROM pg_depend d
      WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.refclassid='pg_proc'::regclass), '{}') AS dependencies
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast'
    ORDER BY n.nspname, p.proname, p.oid::regprocedure::text`);
  return rows;
}

export function reachableFunctions(catalog, callers) {
  const byId = new Map(catalog.map(row => [row.oid, row]));
  const reached = new Map();
  for (const row of catalog) {
    const direct = callers.get(`${row.schema}.${row.name}`);
    if (direct && row.runtime_execute) reached.set(row.oid, [...direct]);
  }
  for (const [id] of reached) {
    const row = byId.get(id);
    for (const next of catalog) {
      // PL/pgSQL string bodies need prosrc as well as pg_depend. Include all overloads
      // and unqualified calls conservatively; a lexical edge is not a safety proof.
      const qualified = new RegExp(`\\b${next.schema}\\.${next.name}\\s*\\(`, "u");
      const unqualified = new RegExp(`(?<![a-zA-Z_0-9.])${next.name}\\s*\\(`, "u");
      if ((row.dependencies ?? []).includes(next.oid) || qualified.test(row.source) || unqualified.test(row.source)) {
        if (!reached.has(next.oid)) reached.set(next.oid, [row.signature]);
      }
    }
  }
  return catalog.filter(row => reached.has(row.oid)).map(row => ({ ...row, callers: reached.get(row.oid) }));
}

export function reportRow(row) {
  const assessment = assessments[`${row.schema}.${row.name}`];
  return `| ${row.signature} | ${row.owner}; runtime EXECUTE=${row.runtime_execute} | ${row.callers.join(", ")} | ${assessment?.jobRows ?? "unclear: inspect tables/views/triggers and nested calls"} | ${assessment?.classification ?? "unclear"} | ${assessment?.reason ?? "Requires owner-policy and resource-path inspection; tenant binding or a textual firm marker is insufficient."} | ${assessment?.proof ?? "catalog/source discovery only"} |`;
}
