import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import routines from "./lp6d-routines.json";
import classification from "./lp6d-runtime-classification.json";
import { loadReviewedInventory, pathCompleteness, repoFileExists } from "./lp-0-catalog.js";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../migrations/0526_lp6d_remaining_routines.sql");

it("keeps every predecessor body and permission rule behind an early binding check", () => {
  for (const routine of routines) {
    const source = read(`../../../${routine.source}`);
    const pattern = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${routine.name.replaceAll(".", "\\.")}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, "g");
    let previous = [...source.matchAll(pattern)].at(-1)![1]!.trim().replace(/;$/, "").replace("#variable_conflict use_column", "").trim();
    if (routine.name === "app.ch4_work_state_command") {
      // 0380 patches pg_get_functiondef rather than declaring another CREATE.
      const marker = " PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));";
      previous = previous.replace(marker, `${marker}\n PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));`)
        .replace("IF action='resume' THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;", "")
        .replace("'finish','cancel_finish','close','reopen','link'", "'finish','cancel_finish','close','reopen','link','resume'")
        .replace("IF action='finish' THEN\n  IF marker.kind", "IF action='resume' THEN\n  PERFORM app.ch4_require_open(t,j);\n  PERFORM app.ch4_admit_place(t,j,action);\n  event_kind:='resumed';\n ELSIF action='finish' THEN\n  IF marker.kind");
    }
    const changed = [...sql.matchAll(pattern)].at(-1)![1]!;
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
  expect(Object.keys(assigned).some(key => key.startsWith("app.mon9_session("))).toBe(false);
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
  expect(sql).toContain("JOIN app.lp6d_contractor_session_identity(p_credential::uuid) effective");
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
  expect(inventory.entries.filter(e => e.group === "a-lp6d-routine-binding")).toHaveLength(6);
});
