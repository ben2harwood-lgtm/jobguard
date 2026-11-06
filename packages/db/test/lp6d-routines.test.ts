import { existsSync, readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import mainPredecessors from "./lp6d-main-predecessors.json";
import routines from "./lp6d-routines.json";
import classification from "./lp6d-runtime-classification.json";
import { loadReviewedInventory, pathCompleteness, repoFileExists } from "./lp-0-catalog.js";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../migrations/0780_lp6d_remaining_routines.sql");
const definitions = (source: string) => [...source.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (app\.\w+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+\$\$([\s\S]*?)\$\$\s*;/gis)];
const argumentsKey = (args: string) => args.replace(/\s+/gu, "").toLowerCase();
const body = (source: string, routine: typeof routines[number]) => definitions(source)
  .filter(m => m[1] === routine.name && argumentsKey(m[2]!) === argumentsKey(routine.arguments)).at(-1)![3]!;

it("keeps every predecessor body and permission rule behind an early binding check", () => {
  for (const routine of routines) {
    const source = existsSync(new URL(`../../../${routine.source}`, import.meta.url))
      ? read(`../../../${routine.source}`) : (mainPredecessors.sources as Record<string, string>)[routine.source]!;
    let previous = body(source, routine).trim().replace(/;$/, "").replace("#variable_conflict use_column", "").trim();
    if (routine.name === "app.ch4_work_state_command") {
      // 0380 patches pg_get_functiondef rather than declaring another CREATE.
      const marker = " PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));";
      previous = previous.replace(marker, `${marker}\n PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));`)
        .replace("IF action='resume' THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;", "")
        .replace("'finish','cancel_finish','close','reopen','link'", "'finish','cancel_finish','close','reopen','link','resume'")
        .replace("IF action='finish' THEN\n  IF marker.kind", "IF action='resume' THEN\n  PERFORM app.ch4_require_open(t,j);\n  PERFORM app.ch4_admit_place(t,j,action);\n  event_kind:='resumed';\n ELSIF action='finish' THEN\n  IF marker.kind");
    }
    if (routine.name === "app.sv7a_intake_job_source") {
      previous = previous.replace("PERFORM app.ch4_admit_place(t,j,'restart');", "IF EXISTS(SELECT 1 FROM app.job x WHERE x.tenant_id=t AND x.id=j AND x.practice_session_digest IS NULL) THEN PERFORM app.ch4_admit_place(t,j,'restart'); END IF;")
        .replaceAll("app.ch4_require_command_owner(t,j,digest)", "app.sv7a_require_source_owner(t,j,digest,source)")
        .replace("WHEN source='customer_message' AND txt='Please fit an outside tap.' THEN 'job-source:request-tap.v1' END;", "WHEN source='customer_message' AND txt='Please fit an outside tap.' THEN 'job-source:request-tap.v1' WHEN source='customer_message' AND txt='There are exposed live wires beside the new socket.' THEN 'customer-message:exposed-wires.synthetic.v1' END;");
    }
    // This additional comparison precedes hidden billability source reads.
    const changed = body(sql, routine)
      .replace(/ IF a\.membership_id IS DISTINCT FROM app\.current_actor\(\) OR a\.tenant_id IS DISTINCT FROM app\.current_tenant\(\) THEN\n  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';\n END IF;\n/u, "")
      .replace(/ -- LP6D_DERIVED_ACTOR\n IF (?:a|actor|principal)\.membership_id IS DISTINCT FROM app\.current_actor\(\) THEN\n  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';\n END IF;\n/gu, "");
    expect(changed, routine.name).toContain(previous);
    expect(changed.indexOf("PERFORM app.current_actor()"), routine.name).toBeLessThan(changed.indexOf(previous));
    expect(changed).toContain("IS DISTINCT FROM app.current_tenant()::text");
    if (routine.actor) expect(changed).toContain(`${routine.actor} IS DISTINCT FROM app.current_actor()`);
    if (routine.tenant) expect(changed).toContain(`${routine.tenant} IS DISTINCT FROM app.current_tenant()`);
  }
});
it("assigns every snapshot runtime definer without claiming the sibling money work is implemented", () => {
  const inventory = JSON.parse(read("../../../docs/contracts/lp-0-effective-privileges-v1.json"));
  const assigned: Record<string, string> = classification;
  for (const routine of inventory.recorded.routines) {
    if (routine.securityDefiner && routine.runtimeExecute) expect(assigned[routine.identity.slice("function:".length)], routine.identity).toBeDefined();
  }
  expect(assigned["app.mon9_session(text,uuid)"]).toBe("LP-6d");
  expect(assigned["app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb)"]).toBe("LP-6c");
  for (const routine of routines.filter(r => !r.subjectActor)) expect(routine.name).not.toBe("app.mon1_company_actor");
});
it("retains the later admission/resume amendment on the CH4 command", () => {
  const body = sql.match(/CREATE OR REPLACE FUNCTION app\.ch4_work_state_command\([\s\S]*?\$\$([\s\S]*?)\$\$;/)![1]!;
  expect(body).toContain("pg_advisory_xact_lock(hashtextextended(t::text,184))");
  expect(body).toContain("PERFORM app.ch4_admit_place(t,j,action)");
  expect(body).toContain("event_kind:='resumed'");
  expect(body).not.toContain("CAPACITY_ADMISSION_UNAVAILABLE");
});
it("shares the unchanged switched-session projection without exposing its private helper", () => {
  const source = read("../migrations/0165_practice_worker_switch.sql");
  const previous = source.match(/CREATE OR REPLACE FUNCTION app\.contractor_session\([\s\S]*?\$\$([\s\S]*?)\$\$;/)![1]!.trim();
  const projection = sql.match(/CREATE FUNCTION app\.lp6d_contractor_session_identity\([\s\S]*?\$\$([\s\S]*?)\$\$;/)![1]!.trim();
  expect(projection).toBe(previous);
  expect(sql).toContain("FROM app.lp6d_contractor_session_identity(p_credential::uuid) effective");
  expect(sql).toContain("PERFORM app.bind_request('contractor_practice',s::text,selected_tenant)");
  expect(sql).toContain("REVOKE ALL ON FUNCTION app.lp6d_contractor_session_identity(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure");
});
it("converts the invitation bridge and withdraws direct authorization revocation", async () => {
  const invite = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION identity.invite_member"));
  expect(invite.indexOf("app.bind_request('real',session_digest::text,t)")).toBeLessThan(invite.indexOf("pg_advisory_xact_lock"));
  expect(invite).toContain("m.id=app.current_actor()");
  expect(sql).toContain("REVOKE UPDATE(revoked_at) ON app.action_authorization FROM PUBLIC,jobguard_runtime");
  expect(read("../src/recovery-message-repository.ts")).toContain("SELECT app.revoke_recovery_message_authorization($1,$2,$3,$4)");
  expect(read("../src/recovery-message-repository.ts")).not.toContain("UPDATE app.action_authorization");
  const { inventory } = await loadReviewedInventory();
  expect(pathCompleteness(inventory, repoFileExists)).toEqual([]);
  expect(inventory.entries.some(e => e.key === "acl|col|app.action_authorization.revoked_at|jobguard_runtime|UPDATE|-")).toBe(false);
  expect(inventory.entries.filter(e => e.group === "a-lp6d-routine-binding")).toHaveLength(4);
});

it("leaves the final-lock owner helper exclusively to LP-6c", () => {
  expect(routines.some(r => r.name === "app.final_lock_require_owner")).toBe(false);
  expect(sql).not.toContain("CREATE OR REPLACE FUNCTION app.final_lock_require_owner(");
});

it("starts from the latest exact predecessor overload rather than an earlier copied body", () => {
  const latest = new Map<string, string>();
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).filter(f => f.endsWith(".sql") && f < "0780").sort()) {
    for (const m of definitions(read(`../migrations/${file}`))) latest.set(m[1]! + argumentsKey(m[2]!), `packages/db/migrations/${file}`);
  }
  // Main-only predecessors are exact source snapshots until the router restacks
  // this serial LP branch. A present migration always wins over a snapshot.
  for (const [path, source] of Object.entries(mainPredecessors.sources)) {
    if (existsSync(new URL(`../../../${path}`, import.meta.url))) continue;
    for (const m of definitions(source)) latest.set(m[1]! + argumentsKey(m[2]!), path);
  }
  for (const routine of routines) expect(routine.source, routine.name + routine.arguments)
    .toBe(latest.get(routine.name + argumentsKey(routine.arguments)));
});

it("preserves LP-6b's entire latest session helper except its private projection edge", () => {
  const pattern = /CREATE OR REPLACE FUNCTION app\.lp6_session_authority\([\s\S]*?\$\$;/u;
  const previous = read("../migrations/0584_lp6b_effective_session_actor.sql").match(pattern)![0];
  expect(sql.match(pattern)![0]).toBe(previous.replace("FROM app.contractor_session(p_credential::uuid) effective", "FROM app.lp6d_contractor_session_identity(p_credential::uuid) effective"));
  expect(sql).not.toContain("GRANT EXECUTE ON FUNCTION app.current_actor()");
  expect(sql).not.toContain("GRANT EXECUTE ON FUNCTION app.bind_request(text,text,uuid)");
});

it("binds new evidence authority, payload actors and source readers without relaxing the original permissions", () => {
  expect(sql).toContain("(c->>'actorMembershipId')::uuid IS DISTINCT FROM app.current_actor()");
  const billability = routines.find(r => r.name === "app.recovery_billability")!;
  const checked = body(sql, billability);
  expect(checked.indexOf("a.membership_id IS DISTINCT FROM app.current_actor()")).toBeLessThan(checked.indexOf("-- No hidden source lookup"));
  const reader = /CREATE OR REPLACE FUNCTION app\.ent3_extra_work_status\([\s\S]*?\$\$([\s\S]*?)\$\$;/u.exec(sql)![1]!;
  const original = /CREATE FUNCTION app\.ent3_extra_work_status\([\s\S]*?\$\$([\s\S]*?)\$\$;/u.exec(read("../migrations/0574_site_extra_work_status.sql"))![1]!.trim();
  expect(reader).toContain(`RETURN (${original});`);
  expect(reader.indexOf("PERFORM app.current_actor()")).toBeLessThan(reader.indexOf("RETURN ("));
  for (const name of ["app.final_check_builder", "app.read_success_fee_v3", "app.pf1b_review_supplier_credit", "app.read_value_job"]) {
    const checkedBody = body(sql, routines.find(r => r.name === name)!);
    expect(checkedBody, name).toMatch(/-- LP6D_DERIVED_ACTOR\n IF (?:a|actor|principal)\.membership_id IS DISTINCT FROM app\.current_actor\(\)/u);
  }
});

it("reuses every actual LP-6c replacement without recreating its routines", () => {
  const previous = definitions(read("../migrations/0591_lp6c_money_binding.sql"));
  const own = new Set(definitions(sql).map(m => m[1]! + argumentsKey(m[2]!)));
  expect(previous).toHaveLength(28);
  for (const m of previous) expect(own.has(m[1]! + argumentsKey(m[2]!)), m[1]).toBe(false);
});

it("keeps the pre-session feature lookup available while retaining request guards elsewhere", () => {
  expect(routines.some(r => r.name === "app.mon8_feature_decision")).toBe(false);
  expect(sql).not.toContain("CREATE OR REPLACE FUNCTION app.mon8_feature_decision(");
  expect(classification["app.mon8_feature_decision(uuid,text,text)"]).toContain("pre-session SSO");
  const sso = read("../migrations/0549_contractor_feature_guards.sql");
  expect(sso).toContain("app.mon8_feature_decision");
});

it("records both private and request routine identities and the retained worker owner", async () => {
  const { inventory } = await loadReviewedInventory();
  for (const signature of ["lp6d_contractor_session_identity(uuid)", "revoke_recovery_message_authorization(uuid,uuid,uuid,uuid)"]) {
    expect(inventory.recorded.routines.filter(r => r.identity === `function:app.${signature}`)).toHaveLength(1);
    expect(inventory.entries.some(e => e.key === `owner|routine|function:app.${signature}|jobguard_migration`)).toBe(true);
  }
  expect(inventory.entries.some(e => e.key === "owner|routine|function:app.apply_recovery_timeline_signal(uuid,jsonb)|jobguard_migration")).toBe(true);
});
