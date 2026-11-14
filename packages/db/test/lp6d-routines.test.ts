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
    if (routine.name === "app.xa_begin") {
      // r10: a delegated customer (scoped by the prefix) takes the same feature decision privately.
      previous = previous.replace(" IF p_types IS DISTINCT FROM ARRAY['RevokeClientApproval']::text[] THEN PERFORM app.mon8_require_feature(p_actor,'approval_chains'); END IF;",
        " -- LP6D_DELEGATED_FEATURE: the delegated customer (already scoped above) takes the same decision privately.\n IF p_types IS DISTINCT FROM ARRAY['RevokeClientApproval']::text[] THEN IF app.current_actor() IS NULL THEN IF NOT (app.lp6d_mon8_feature_decision(p_actor,'approval_chains')->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; ELSE PERFORM app.mon8_require_feature(p_actor,'approval_chains'); END IF; END IF;");
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
    // Checker r10: xa_client_decide reads the third-party issuer's authority through the private issuer chain.
    if (routine.name === "app.xa_client_decide") {
      previous = previous.replace(" IF NOT app.xc_link_current(v_link.id) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;",
        " -- LP6D_ISSUER (checker r10): the link's issuer is a third party with no request of its own, so its\n -- current send authority is read through the private issuer chain (never through the customer's binding).\n IF NOT app.lp6d_xc_link_current(v_link.id) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;");
    }
    if (routine.name === "app.xa_client_view_authority") {
      previous = previous.replace("  AND NOT app.xc_link_current(k.id)) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;",
        "  -- LP6D_ISSUER (checker r10): each link's issuer is a third party; read through the private issuer chain.\n  AND NOT app.lp6d_xc_link_current(k.id)) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;");
    }
    // Repair 23 (Router ruling): the unbound read-only skip reads the published check through the pinned copy.
    if (routine.name === "app.ch6_integrity_published") {
      previous = previous.replace(" reveal:=app.read_final_check_reveal(t,j,d);\n",
        " -- LP6D_UNBOUND_COPY (repair 23): the unbound read-only skip reads the published check through the pinned copy.\n reveal:=CASE WHEN app.lp6d_request_bound() THEN app.read_final_check_reveal(t,j,d) ELSE app.lp6d_read_final_check_reveal_unbound(t,j,d) END;\n");
    }
    // This additional comparison precedes hidden billability source reads.
    const changed = body(sql, routine)
      .replace(/ IF a\.membership_id IS DISTINCT FROM app\.current_actor\(\) OR a\.tenant_id IS DISTINCT FROM app\.current_tenant\(\) THEN\n  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';\n END IF;\n/u, "")
      .replace(/ -- LP6D_DERIVED_ACTOR[^\n]*\n(?: --[^\n]*\n)? IF (?:(?:a|actor|principal)\.(?:membership_id|member_id) IS NOT NULL AND )?(?:a|actor|principal)\.(?:membership_id|member_id) IS DISTINCT FROM app\.current_actor\(\) THEN\n  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';\n END IF;\n/gu, "");
    expect(changed, routine.name).toContain(previous);
    expect(changed.indexOf("PERFORM app.current_actor()"), routine.name).toBeLessThan(changed.indexOf(previous));
    // The stamped tenant may be any accepted UUID spelling (ENT-4b [S4]); the guard compares it case-insensitively.
    expect(changed).toContain("lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text");
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
  // r8: the revocation routine, revoke-claim helper and seven runtime lock/refusal/maintenance/probe helpers (owner + EXECUTE each),
  // plus (r10) the command-writer-owned delegated-actor match check (owner + migration EXECUTE). LP-6c's accessor gains no grant.
  expect(inventory.entries.filter(e => e.group === "a-lp6d-routine-binding")).toHaveLength(28); // r11: + ClientViewExtra binder and scope check (owner + EXECUTE each) and the escalation worker (owner + runtime EXECUTE)
  expect(inventory.entries.some(e => e.key.startsWith("acl|routine|function:app.lp6_delegated_actor(") && e.key.includes("|jobguard_migration|"))).toBe(false);
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
  // 0732 moved Final Check authority into the private final_check_read_authority; the builder binds the digest in its prefix.
  expect(body(sql, routines.find(r => r.name === "app.final_check_builder")!)).toContain("LP6D_DIGEST");
  expect(sql).toContain("(c->>'actorMembershipId')::uuid IS DISTINCT FROM app.current_actor()");
  const billability = routines.find(r => r.name === "app.recovery_billability")!;
  const checked = body(sql, billability);
  expect(checked.indexOf("a.membership_id IS DISTINCT FROM app.current_actor()")).toBeLessThan(checked.indexOf("-- No hidden source lookup"));
  const reader = /CREATE OR REPLACE FUNCTION app\.ent3_extra_work_status\([\s\S]*?\$\$([\s\S]*?)\$\$;/u.exec(sql)![1]!;
  const original = /CREATE FUNCTION app\.ent3_extra_work_status\([\s\S]*?\$\$([\s\S]*?)\$\$;/u.exec(read("../migrations/0574_site_extra_work_status.sql"))![1]!.trim();
  expect(reader).toContain(`RETURN (${original});`);
  expect(reader.indexOf("PERFORM app.current_actor()")).toBeLessThan(reader.indexOf("RETURN ("));
  for (const name of ["app.read_success_fee_v3", "app.pf1b_review_supplier_credit", "app.read_value_job"]) {
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
    .toBe(prior.replaceAll("app.xa_client_view_authority(", "app.lp6d_client_view_authority(")
      // Checker r11 (option 1): only the read-only queue/view binds its own ClientViewExtra request before the timing read.
      .replace(" result:=jsonb_build_object('requestId',q.id,'revision',q.request_revision,",
        " -- Checker r11: the read-only queue/view binds its own ClientViewExtra request before the\n -- guarded timing read. History stays unbound (it reads through the private view port).\n PERFORM app.lp6d_bind_client_viewer(t,j,c,k.token_hash,k.recipient);\n result:=jsonb_build_object('requestId',q.id,'revision',q.request_revision,"));
  // The ClientViewExtra binder is LP-6c's binder with only its scope changed; ent3_extra_work_status alone accepts that scope.
  const binder = read("../migrations/0725_lp6c_client_extra_decision.sql").match(/CREATE FUNCTION app\.lp6_bind_client_approver\([\s\S]*?\$\$;/u)![0];
  expect(sql.match(/CREATE FUNCTION app\.lp6d_bind_client_viewer\([\s\S]*?\$\$;/u)![0]).toBe(binder
    .replaceAll("lp6_bind_client_approver", "lp6d_bind_client_viewer")
    .replace(" -- Tenant context permits only the lookup. The existing validator supplies authority\n -- and retains the decide path's shared tenant/job locks through completion.\n", "")
    .replace("j,'ClientDecideExtra');", "j,'ClientViewExtra');"));
  expect(sql.match(/'ClientViewExtra'/gu)!.length).toBe(2); // the binder and the status reader; nothing that decides
  expect(sql).toContain("IF app.current_actor() IS NOT NULL OR NOT app.lp6d_has_delegated_scope('ClientViewExtra',p_job) THEN");
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
  // The caller binds once (LP-6c refuses a second binding); the private port requires that delegated binding first.
  expect(privateSource).not.toContain("app.lp6_bind_customer_portal(");
  expect(privateSource.indexOf("IF app.current_actor() IS NOT NULL THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED'")).toBeLessThan(privateSource.indexOf("DECLARE actor"));
  expect(privateSource.indexOf("IF app.current_actor() IS NOT NULL THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED'")).toBeGreaterThan(-1);
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

it("pins the actor-less escalation copy to app.xa_escalate minus only its binding prefix (router ruling r11)", () => {
  const bodyOf = (name: string) => definitions(sql).filter(m => m[1] === name).at(-1)![3]!;
  const guarded = bodyOf("app.xa_escalate").replace("\n#variable_conflict use_column\n", "");
  const prefix = /^\s*BEGIN\n -- LP6D_BOUND[^\n]*\n PERFORM app\.current_actor\(\);\n.*?\n END IF;\n/su.exec(guarded);
  expect(prefix).not.toBeNull();
  const original = guarded.slice(prefix![0].length).replace(/;\nEND\n$/u, "").trim();
  expect(bodyOf("app.lp6d_xa_escalate").replace("\n#variable_conflict use_column\n", "").trim()).toBe(original);
  // The guarded original keeps its binding check; no skip.
  expect(bodyOf("app.xa_escalate")).toContain("IF app.current_actor() IS NULL OR");
  expect(bodyOf("app.xa_escalate")).not.toContain("lp6d_request_bound");
  // Private: revoked from PUBLIC/runtime/identity/infrastructure, reachable only from the worker definer.
  expect(sql).toContain("REVOKE ALL ON FUNCTION app.lp6d_xa_escalate() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;");
  expect(sql).not.toMatch(/GRANT [^;]*app\.lp6d_xa_escalate\(\)/u);
  expect(sql.match(/app\.lp6d_xa_escalate\(\)/gu)!.length).toBe(5); // create, owner, revoke, login revoke, and the one worker call
  const worker = bodyOf("app.lp6d_escalate_overdue_worker");
  expect(worker).toContain("IF app.lp6d_request_bound() THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED'");
  expect(worker).toContain("RETURN QUERY SELECT * FROM app.lp6d_xa_escalate();");
  expect(sql).toMatch(/Both move to the LP-10 worker binding when that lands/u);
  expect(read("../src/extra-approval-chain-repository.ts")).toContain("SELECT * FROM app.lp6d_escalate_overdue_worker()");
});

it("reads the abandoned visit's operative through a pinned third-party copy; the closer is otherwise its 0722 body", () => {
  const bodyOf = (name: string) => definitions(sql).filter(m => m[1] === name).at(-1)![3]!;
  const guarded = bodyOf("app.ent3b_visit_authority");
  const prefix = /^\s*BEGIN\n -- LP6D_BOUND[^\n]*\n PERFORM app\.current_actor\(\);\n.*?\n END IF;\n/su.exec(guarded)!;
  expect(bodyOf("app.lp6d_visit_authority_of").trim()).toBe(guarded.slice(prefix[0].length).replace(/;\nEND\n$/u, "").trim());
  expect(guarded).toContain("OR p_actor IS DISTINCT FROM app.current_actor() THEN"); // the original keeps its binding check
  expect(sql).toContain("REVOKE ALL ON FUNCTION app.lp6d_visit_authority_of(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;");
  expect(sql).not.toMatch(/GRANT [^;]*app\.lp6d_visit_authority_of\(/u);
  expect(sql.match(/app\.lp6d_visit_authority_of\(visit_row/gu)).toHaveLength(1); // the closer is its only caller
  const latest = definitions(read("../migrations/0722_abandoned_visit_authority.sql")).filter(m => m[1] === "app.ent3b_close_abandoned_visit").at(-1)![3]!;
  expect(bodyOf("app.ent3b_close_abandoned_visit")).toBe(latest.replace(" IF EXISTS(SELECT 1 FROM app.ent3b_visit_authority(visit_row.membership_id,p_job)",
    " -- LP6D_THIRD_PARTY (repair 12): the visit's operative is a third party with no request of its own; its\n -- current visit authority is read through the private copy, never through the caller's binding.\n IF EXISTS(SELECT 1 FROM app.lp6d_visit_authority_of(visit_row.membership_id,p_job)"));
});

it("evidence-pack workers read the stored session's ownership through a pinned private copy (repair 21)", () => {
  const bodyOf = (name: string) => definitions(sql).filter(m => m[1] === name).at(-1)![3]!;
  const guarded = bodyOf("app.evidence_pack_v3_owner");
  const prefix = /^\s*BEGIN\n -- LP6D_BOUND[^\n]*\n(?: --[^\n]*\n)* PERFORM app\.current_actor\(\);\n.*?\n END IF;\n/su.exec(guarded)!;
  expect(bodyOf("app.lp6d_evidence_pack_v3_owner").trim()).toBe(guarded.slice(prefix[0].length).replace(/;\nEND\n$/u, "").trim());
  expect(sql).toContain("REVOKE ALL ON FUNCTION app.lp6d_evidence_pack_v3_owner(uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow;");
  expect(sql).not.toMatch(/GRANT [^;]*app\.lp6d_evidence_pack_v3_owner\(/u);
  for (const [name, file] of [["app.prepare_evidence_pack_v3", "0306_evidence_pack_v3.sql"], ["app.complete_evidence_pack_v3_check", "0306_evidence_pack_v3.sql"], ["app.finish_evidence_pack_v3", "0375_evidence_pack_v3_activation.sql"]]) {
    const latest = definitions(read(`../migrations/${file}`)).filter(m => m[1] === name).at(-1)![3]!;
    expect(bodyOf(name), name).toBe(latest.replaceAll("app.evidence_pack_v3_owner(", "app.lp6d_evidence_pack_v3_owner("));
  }
  // Only those three worker routines call the copy.
  expect(definitions(sql).filter(m => m[3]!.includes("app.lp6d_evidence_pack_v3_owner(")).map(m => m[1]).sort())
    .toEqual(["app.complete_evidence_pack_v3_check", "app.finish_evidence_pack_v3", "app.prepare_evidence_pack_v3"]);
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
    // Both the guarded original and its copy read the third-party issuer through the private issuer chain (checker r10).
    ["app.lp6d_client_view_authority", "app.xa_client_view_authority", (b: string) => b],
    ["app.lp6d_customer_watchdog_live", "app.require_watchdog_live", (b: string) => b],
    // Maintenance copies add exactly one refusal of every non-maintenance login.
    ["app.lp6d_watchdog_live_maintenance", "app.require_watchdog_live", (b: string) => b.replace(maintenanceLine, "")],
    ["app.lp6d_job_parties_maintenance", "app.require_current_job_parties", (b: string) => b.replace(maintenanceLine, "")],
    // The SSO bootstrap fixes feature='sso' and purpose='new_work' as constants.
    ["app.mon8_sso_feature_decision", "app.mon8_feature_decision", (b: string) => b.replace("feature constant text:='sso'; purpose constant text:='new_work'; ", "")],
    // Customer approval path: only its calls are redirected to the private chain.
    ["app.lp6d_xa_covers", "app.xa_covers", (b: string) => b],
  ] as const) {
    expect(adapt(bodyOf(copy)).trim().replace(/;$/u, ""), copy).toBe(unguarded(original).replace(/;$/u, ""));
  }
  const latest = (file: string, name: string) => definitions(read(`../migrations/${file}`)).filter(m => m[1] === name).at(-1)![3]!;
  expect(bodyOf("app.lp6d_xc_send_authority").replace("app.lp6d_xa_covers(", "app.xa_covers(")).toBe(latest("0642_extra_client_send_authority.sql", "app.xc_send_authority"));
  expect(bodyOf("app.lp6d_xc_link_current").replace("app.lp6d_xc_send_authority(", "app.xc_send_authority(")).toBe(latest("0686_extra_client_authority_loss.sql", "app.xc_link_current"));
  for (const copy of ["lp6d_xa_covers(uuid,text[],uuid,text)", "lp6d_xc_send_authority(uuid,uuid)", "lp6d_xc_link_current(uuid)"]) {
    expect(sql, copy).toContain(`REVOKE ALL ON FUNCTION app.${copy} FROM PUBLIC,jobguard_runtime,jobguard_identity`);
  }
  for (const copy of ["lp6d_mon8_feature_decision(uuid,text,text)", "lp6d_client_view_authority(uuid,uuid,uuid,text)", "lp6d_customer_watchdog_live(uuid)", "lp6d_job_parties_maintenance(uuid,uuid)", "mon8_sso_feature_decision(uuid)"]) {
    expect(sql, copy).toMatch(new RegExp(`REVOKE ALL ON FUNCTION app\\.${copy.replace(/[()]/gu, "\\$&")} FROM PUBLIC,jobguard_runtime,jobguard_identity`, "u"));
  }
});

it("accepts the LP-6c delegated customer only for its own job and ClientDecideExtra scope (checker r10)", () => {
  for (const name of ["app.xa_covers", "app.xa_begin", "app.xa_client_decide", "app.xa_client_view_authority", "app.lp5b_contractor_permission"]) {
    const b = definitions(sql).filter(m => m[1] === name).at(-1)![3]!;
    expect(b, name).toContain("ELSIF NOT app.lp6d_is_delegated_actor(p_actor,'ClientDecideExtra',p_job) THEN");
    expect(b.indexOf("LP6D_DELEGATED"), name).toBeLessThan(b.indexOf("\nDECLARE"));
  }
  // The LP-5b permission check admits the delegated customer only for ClientDecideExtra.
  const lp5b = definitions(sql).filter(m => m[1] === "app.lp5b_contractor_permission").at(-1)![3]!;
  expect(lp5b).toContain("ELSIF app.current_actor() IS NOT NULL OR p_type IS DISTINCT FROM 'ClientDecideExtra' THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED'");
  // Router ruling (b): only CloseAbandonedSiteVisit, whose body itself refuses a named actor other than the bound one, reaches the body.
  expect(lp5b).toContain("IF app.current_actor() IS NOT NULL AND p_type='CloseAbandonedSiteVisit'");
  expect(lp5b).toContain("IF current_database()<>'jobguard_synthetic_demo' OR p_actor IS DISTINCT FROM app.current_actor()");
  expect(sql).not.toMatch(/FUNCTION app\.lp6d_xa_(begin|client_decide)\(/u);
  // LP-6c keeps the delegated actor reader away from jobguard_migration: only a yes/no match runs, as the command writer.
  expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION app\.lp6_delegated_actor\([^)]*\) TO jobguard_migration/u);
  expect(definitions(sql).filter(m => m[1] === "app.lp6d_is_delegated_actor").at(-1)![3]!).toContain("p_actor IS NOT NULL AND p_actor IS NOT DISTINCT FROM");
  expect(sql).toContain("ALTER FUNCTION app.lp6d_is_delegated_actor(uuid,text,uuid) OWNER TO jobguard_command_writer;");
  expect(sql).toContain("REVOKE ALL ON FUNCTION app.lp6d_is_delegated_actor(uuid,text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;");
});

it("reads the published final check on the unbound read-only skip through two pinned private copies (repair 23)", () => {
  const bodyOf = (name: string) => definitions(sql).filter(m => m[1] === name).at(-1)![3]!;
  const unguarded = (name: string) => {
    const guarded = bodyOf(name), prefix = /^\s*BEGIN\n -- LP6D_BOUND[^\n]*\n(?: --[^\n]*\n)*(?: PERFORM app\.current_actor\(\);\n)?.*?\n END IF;\n/su.exec(guarded)!;
    return guarded.slice(prefix[0].length).replace(/;\nEND\n$/u, "").trim();
  };
  expect(bodyOf("app.lp6d_final_check_builder_unbound").trim()).toBe(unguarded("app.final_check_builder"));
  expect(bodyOf("app.lp6d_read_final_check_reveal_unbound").trim())
    .toBe(unguarded("app.read_final_check_reveal").replace("app.final_check_builder(", "app.lp6d_final_check_builder_unbound("));
  // The guarded originals keep their binding checks.
  for (const name of ["app.final_check_builder", "app.read_final_check_reveal"]) expect(bodyOf(name)).toContain("IF app.current_actor() IS NULL OR");
  for (const sig of ["lp6d_final_check_builder_unbound(uuid,uuid,text,boolean)", "lp6d_read_final_check_reveal_unbound(uuid,uuid,text)"]) {
    expect(sql).toContain(`ALTER FUNCTION app.${sig} OWNER TO jobguard_migration;`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION app.${sig} FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow;`);
    expect(sql).toContain(`EXECUTE format('REVOKE ALL ON FUNCTION app.${sig} FROM %I',login.rolname);`);
  }
  expect(sql).not.toMatch(/GRANT [^;]*app\.lp6d_(?:final_check_builder|read_final_check_reveal)_unbound\(/u);
  expect(sql).not.toMatch(/SECURITY DEFINER[^$]*AS \$\$\n[^$]*lp6d_(?:final_check_builder|read_final_check_reveal)_unbound/u);
  // Caller list: the builder copy only from the reveal copy, the reveal copy only from ch6_integrity_published's unbound branch.
  const callers = (copy: string) => definitions(sql).filter(m => m[3]!.includes(`app.${copy}(`)).map(m => m[1]).sort();
  expect(callers("lp6d_final_check_builder_unbound")).toEqual(["app.lp6d_read_final_check_reveal_unbound"]);
  expect(callers("lp6d_read_final_check_reveal_unbound")).toEqual(["app.ch6_integrity_published"]);
  expect(bodyOf("app.ch6_integrity_published").match(/app\.lp6d_read_final_check_reveal_unbound\(/gu)).toHaveLength(1);
  expect(bodyOf("app.ch6_integrity_published")).toContain(
    " reveal:=CASE WHEN app.lp6d_request_bound() THEN app.read_final_check_reveal(t,j,d) ELSE app.lp6d_read_final_check_reveal_unbound(t,j,d) END;\n");
  // Neither copy reaches a third guarded routine.
  for (const copy of ["app.lp6d_final_check_builder_unbound", "app.lp6d_read_final_check_reveal_unbound"]) {
    const reached = [...bodyOf(copy).matchAll(/app\.([a-z0-9_]+)\(/gu)].map(m => `app.${m[1]}`)
      .filter(n => !n.startsWith("app.lp6d_") && definitions(sql).some(d => d[1] === n));
    expect(reached, copy).toEqual([]);
  }
});
