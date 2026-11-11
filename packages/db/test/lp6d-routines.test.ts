import { existsSync, readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import mainPredecessors from "./lp6d-main-predecessors.json";
import routines from "./lp6d-routines.json";
import classification from "./lp6d-runtime-classification.json";
import { loadReviewedInventory, pathCompleteness, repoFileExists } from "./lp-0-catalog.js";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../migrations/0980_lp6d_remaining_routines.sql");
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
    if (routine.name === "app.xa_issue_link") {
      // 0642 patches pg_get_functiondef rather than declaring another CREATE.
      previous = previous.replace("IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN",
        "IF app.xa_covers(p_actor,ARRAY['surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN")
        .replace("p_expires_at>clock_timestamp()+interval '31 days'", "p_expires_at>clock_timestamp()+interval '7 days'");
    }
    if (routine.name === "app.sv7a_intake_job_source") {
      previous = previous.replace("PERFORM app.ch4_admit_place(t,j,'restart');", "IF EXISTS(SELECT 1 FROM app.job x WHERE x.tenant_id=t AND x.id=j AND x.practice_session_digest IS NULL) THEN PERFORM app.ch4_admit_place(t,j,'restart'); END IF;")
        .replaceAll("app.ch4_require_command_owner(t,j,digest)", "app.sv7a_require_source_owner(t,j,digest,source)")
        .replace("WHEN source='customer_message' AND txt='Please fit an outside tap.' THEN 'job-source:request-tap.v1' END;", "WHEN source='customer_message' AND txt='Please fit an outside tap.' THEN 'job-source:request-tap.v1' WHEN source='customer_message' AND txt='There are exposed live wires beside the new socket.' THEN 'customer-message:exposed-wires.synthetic.v1' END;");
    }
    // This additional comparison precedes hidden billability source reads.
    const changed = body(sql, routine)
      .replace(/ IF a\.membership_id IS DISTINCT FROM app\.current_actor\(\) OR a\.tenant_id IS DISTINCT FROM app\.current_tenant\(\) THEN\n  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';\n END IF;\n/u, "")
      .replace(/ -- LP6D_DERIVED_ACTOR[^\n]*\n(?: --[^\n]*\n)? IF (?:(?:a|actor|principal)\.(?:membership_id|member_id) IS NOT NULL AND )?(?:a|actor|principal)\.(?:membership_id|member_id) IS DISTINCT FROM app\.current_actor\(\) THEN\n  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';\n END IF;\n/gu, "");
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
  expect(inventory.entries.some(e => e.key.startsWith("acl|col|app.action_authorization.") && e.key.includes("|jobguard_runtime|UPDATE|"))).toBe(false);
  // r8: the revocation routine, revoke-claim helper and seven runtime lock/refusal/maintenance/probe helpers (owner + EXECUTE each).
  expect(inventory.entries.filter(e => e.group === "a-lp6d-routine-binding")).toHaveLength(18);
});

it("leaves the final-lock owner helper exclusively to LP-6c", () => {
  expect(routines.some(r => r.name === "app.final_lock_require_owner")).toBe(false);
  expect(sql).not.toContain("CREATE OR REPLACE FUNCTION app.final_lock_require_owner(");
});

it("starts from the latest exact predecessor overload rather than an earlier copied body", () => {
  const latest = new Map<string, string>();
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).filter(f => f.endsWith(".sql") && f < "0980").sort()) {
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
  const previous = read("../migrations/0658_lp6b_effective_session_actor.sql").match(pattern)![0];
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
    expect(checkedBody, name).toMatch(/-- LP6D_DERIVED_ACTOR[^\n]*\n(?: --[^\n]*\n)? IF (?:((?:a|actor|principal)\.(?:membership_id|member_id)) IS NOT NULL AND \1|(?:a|actor|principal)\.(?:membership_id|member_id)) IS DISTINCT FROM app\.current_actor\(\)/u);
  }
});

it("reuses every actual LP-6c replacement without recreating its routines", () => {
  const previous = definitions(read("../migrations/0723_lp6c_money_binding.sql"));
  const own = new Set(definitions(sql).map(m => m[1]! + argumentsKey(m[2]!)));
  expect(previous.length).toBeGreaterThanOrEqual(28);
  for (const m of previous) expect(own.has(m[1]! + argumentsKey(m[2]!)), m[1]).toBe(false);
});

it("bounds pre-session SSO to a private SSO-only helper while guarding all runtime features", () => {
  const checked = body(sql, routines.find(r => r.name === "app.mon8_feature_decision")!);
  expect(checked).toContain("LP6D_BOUND");
  const helper = sql.match(/CREATE OR REPLACE FUNCTION app\.mon8_sso_feature_decision\(actor uuid\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/u)![1]!;
  expect(helper).toContain("feature constant text:='sso'; purpose constant text:='new_work'");
  expect(sql).toContain("REVOKE ALL ON FUNCTION app.mon8_sso_feature_decision(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure");
  const source = read("../migrations/0549_contractor_feature_guards.sql");
  const previous = source.match(/CREATE OR REPLACE FUNCTION identity\.sso_complete\([\s\S]*?\$\$;/u)![0];
  expect(sql.match(/CREATE OR REPLACE FUNCTION identity\.sso_complete\([\s\S]*?\$\$;/u)![0])
    .toBe(previous.replace("app.mon8_feature_decision(member,'sso')", "app.mon8_sso_feature_decision(member)")
      .replace("PERFORM app.mon8_require_feature(member,'sso');", "IF NOT (app.mon8_sso_feature_decision(member)->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;"));
});

it("records private and request identities, and omits owners of runtime-inaccessible routines", async () => {
  const { inventory } = await loadReviewedInventory();
  for (const signature of ["lp6d_contractor_session_identity(uuid)", "revoke_recovery_message_authorization(uuid,uuid,uuid,uuid)", "mon8_sso_feature_decision(uuid)"]) {
    expect(inventory.recorded.routines.filter(r => r.identity === `function:app.${signature}`)).toHaveLength(1);
  }
  expect(inventory.entries.some(e => e.key === "owner|routine|function:app.revoke_recovery_message_authorization(uuid,uuid,uuid,uuid)|jobguard_migration")).toBe(true);
  for (const signature of ["lp6d_contractor_session_identity(uuid)", "mon8_sso_feature_decision(uuid)"]) {
    expect(inventory.entries.some(e => e.key === `owner|routine|function:app.${signature}|jobguard_migration`)).toBe(false);
  }
});

it("keeps every pre-binding SSO admin gate private without changing other behavior", () => {
  const source = read("../migrations/0549_contractor_feature_guards.sql");
  for (const name of ["sso_admin_command", "sso_required_command", "oidc_create"]) {
    const pattern = new RegExp(`CREATE OR REPLACE FUNCTION identity\\.${name}\\([\\s\\S]*?\\$\\$;`, "u");
    const previous = source.match(pattern)![0];
    const expected = previous.replace(/PERFORM app\.mon8_require_feature\((actor|identity\.sso_require_admin\(s,t\)),'sso'\);/gu,
      (_, actor: string) => `IF NOT (app.mon8_sso_feature_decision(${actor})->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;`);
    expect(sql.match(pattern)![0], name).toBe(expected);
  }
});
it("preserves LP-6c client history and binding through the exact private read body", () => {
  const prior = read("../migrations/0725_lp6c_client_extra_decision.sql")
    .match(/CREATE OR REPLACE FUNCTION identity\.extra_customer_approval\([\s\S]*?\$\$;/u)![0];
  expect(sql.match(/CREATE OR REPLACE FUNCTION identity\.extra_customer_approval\([\s\S]*?\$\$;/u)![0])
    .toBe(prior.replaceAll("app.xa_client_view_authority(", "app.lp6d_client_view_authority(").replaceAll("app.xa_client_decide(", "app.lp6d_xa_client_decide("));
  expect(sql).toContain("REVOKE ALL ON FUNCTION app.lp6d_client_view_authority(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure");
});


it("replaces existing routines and rejects a delegated NULL actor on ordinary ports", () => {
  for (const routine of routines) {
    expect(sql).not.toContain(`CREATE FUNCTION ${routine.name}(`);
    expect(body(sql, routine), routine.name).toContain("IF app.current_actor() IS NULL OR");
  }
  const value = body(sql, routines.find(r => r.name === "app.read_value_job")!);
  expect(value).toContain("IF actor.member_id IS DISTINCT FROM app.current_actor()");
  expect(value).toContain("IF actor.membership_id IS NOT NULL AND actor.membership_id IS DISTINCT FROM app.current_actor()");
});
it("preserves the exact delegated writer body behind private credential-scoped ports", () => {
  const pattern = /CREATE OR REPLACE FUNCTION identity\.customer_portal_message\([\s\S]*?\$\$;/u;
  const previous = read("../migrations/0724_lp6c_customer_portal_delegation.sql").match(pattern)![0];
  expect(sql.match(pattern)![0]).toBe(previous.replace("app.sv7a_intake_job_source(", "app.lp6d_customer_message_source("));
  const privateSource = sql.match(/CREATE FUNCTION app\.lp6d_customer_message_source\([\s\S]*?\$\$;/u)![0];
  expect(privateSource.indexOf("app.lp6_bind_customer_portal(t,j,")).toBeLessThan(privateSource.indexOf("DECLARE actor"));
  expect(privateSource).toContain("source IS DISTINCT FROM 'customer_message'");
  expect(privateSource).toContain("app.lp6d_customer_watchdog_live(j)");
  for (const signature of ["lp6d_customer_watchdog_live(uuid)", "lp6d_customer_message_source(uuid,uuid,text,text,jsonb)"]) {
    expect(sql).toContain(`REVOKE ALL ON FUNCTION app.${signature} FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure`);
  }
});
it("keeps lifecycle storage private while checking revocation with its existing owner", () => {
  const revoke = sql.match(/CREATE FUNCTION app\.revoke_recovery_message_authorization\([\s\S]*?\$\$;/u)![0];
  expect(revoke).toContain("app.lp6d_require_revoke_claim(p_tenant,p_actor,p_command,message.job_id,message.case_id,p_message,");
  expect(revoke).not.toContain("FROM app.command_lifecycle_claim");
  expect(sql).toContain("ALTER FUNCTION app.lp6d_require_revoke_claim(uuid,uuid,uuid,uuid,uuid,uuid,integer) OWNER TO jobguard_command_writer");
  expect(sql).not.toMatch(/GRANT .* ON (?:TABLE )?app\.command_lifecycle_claim/u);
});

it("pins each private unguarded copy to its guarded original minus only the LP-6d binding prefix", () => {
  const bodyOf = (name: string) => definitions(sql).filter(m => m[1] === name).at(-1)![3]!;
  // The guarded original is "BEGIN\n <LP6D_BOUND prefix> END IF;\n<original body>;\nEND\n".
  const unguarded = (name: string) => {
    const guarded = bodyOf(name), prefix = /^\s*BEGIN\n -- LP6D_BOUND[^\n]*\n(?: --[^\n]*\n)*(?: PERFORM app\.current_actor\(\);\n)?.*?\n END IF;\n/su.exec(guarded);
    expect(prefix, name).not.toBeNull();
    return guarded.slice(prefix![0].length).replace(/;\nEND\n$/u, "").trim();
  };
  const maintenanceLine = /\n\s*IF NOT app\.lp6d_maintenance_login\(\) THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;/u;
  for (const [copy, original, adapt] of [
    ["app.lp6d_mon8_feature_decision", "app.mon8_feature_decision", (b: string) => b],
    ["app.lp6d_client_view_authority", "app.xa_client_view_authority", (b: string) => b.replaceAll("app.lp6d_xc_link_current(", "app.xc_link_current(")],
    ["app.lp6d_customer_watchdog_live", "app.require_watchdog_live", (b: string) => b],
    // Maintenance copies add exactly one refusal of every non-maintenance login.
    ["app.lp6d_watchdog_live_maintenance", "app.require_watchdog_live", (b: string) => b.replace(maintenanceLine, "")],
    ["app.lp6d_job_parties_maintenance", "app.require_current_job_parties", (b: string) => b.replace(maintenanceLine, "")],
    // The SSO bootstrap fixes feature='sso' and purpose='new_work' as constants.
    ["app.mon8_sso_feature_decision", "app.mon8_feature_decision", (b: string) => b.replace("feature constant text:='sso'; purpose constant text:='new_work'; ", "")],
    // Customer approval path: only its calls are redirected to the private chain.
    ["app.lp6d_xa_covers", "app.xa_covers", (b: string) => b],
    ["app.lp6d_xa_begin", "app.xa_begin", (b: string) => b.replace("IF NOT (app.lp6d_mon8_feature_decision(p_actor,'approval_chains')->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;", "PERFORM app.mon8_require_feature(p_actor,'approval_chains');")],
    ["app.lp6d_xa_client_decide", "app.xa_client_decide", (b: string) => b.replaceAll("app.lp6d_xa_begin(", "app.xa_begin(").replaceAll("app.lp6d_xa_covers(", "app.xa_covers(")],
  ] as const) {
    expect(adapt(bodyOf(copy)).trim().replace(/;$/u, ""), copy).toBe(unguarded(original).replace(/;$/u, ""));
  }
  const latest = (file: string, name: string) => definitions(read(`../migrations/${file}`)).filter(m => m[1] === name).at(-1)![3]!;
  expect(bodyOf("app.lp6d_xc_send_authority").replace("app.lp6d_xa_covers(", "app.xa_covers(")).toBe(latest("0642_extra_client_send_authority.sql", "app.xc_send_authority"));
  expect(bodyOf("app.lp6d_xc_link_current").replace("app.lp6d_xc_send_authority(", "app.xc_send_authority(")).toBe(latest("0686_extra_client_authority_loss.sql", "app.xc_link_current"));
  for (const copy of ["lp6d_xa_covers(uuid,text[],uuid,text)", "lp6d_xc_send_authority(uuid,uuid)", "lp6d_xc_link_current(uuid)", "lp6d_xa_begin(uuid,uuid,text[],uuid)", "lp6d_xa_client_decide(uuid,uuid,uuid,uuid,text,text,text,bigint,boolean,text,text,text)"]) {
    expect(sql, copy).toContain(`REVOKE ALL ON FUNCTION app.${copy} FROM PUBLIC,jobguard_runtime,jobguard_identity`);
  }
  for (const copy of ["lp6d_mon8_feature_decision(uuid,text,text)", "lp6d_client_view_authority(uuid,uuid,uuid,text)", "lp6d_customer_watchdog_live(uuid)", "lp6d_job_parties_maintenance(uuid,uuid)", "mon8_sso_feature_decision(uuid)"]) {
    expect(sql, copy).toMatch(new RegExp(`REVOKE ALL ON FUNCTION app\\.${copy.replace(/[()]/gu, "\\$&")} FROM PUBLIC,jobguard_runtime,jobguard_identity`, "u"));
  }
});
