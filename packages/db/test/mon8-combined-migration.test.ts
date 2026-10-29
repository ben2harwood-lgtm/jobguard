import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const read=(name:string)=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),"utf8");
const first=read("0352_server_plan_entitlements.sql"), second=read("0353_contractor_feature_guards.sql");
const body=(sql:string,name:string)=>sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION app.${name}(`)).split("END $$;")[0]+"END $$;";
it("preserves all of 0332 worker logic after the entitlement guard",()=>{
 const expected=body(read("0332_northside_finance_switch.sql"),"practice_worker_switch_decision").replace("plpgsql STABLE","plpgsql VOLATILE").replace(" company:=rule.company;"," PERFORM app.mon8_require_feature(rule.owner_member,'operative_roles');\n company:=rule.company;");
 expect(body(first,"practice_worker_switch_decision")).toBe(expected);
});
it("has one combined immutable status writer with the exclusive fence before timestamping",()=>{
 const guard=body(first,"mon8_agreement_status_guard");
 expect((first+second).match(/CREATE OR REPLACE FUNCTION app\.mon8_agreement_status_guard\(/gu)).toHaveLength(1);
 expect(guard).toContain("IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'AGREEMENT_STATUS_IMMUTABLE'");
 expect(guard).toContain("IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN'");
 expect(guard.indexOf("pg_advisory_xact_lock(")).toBeLessThan(guard.indexOf("NEW.created_at:="));
 for(const table of ["app.membership","app.role_grant","identity.invitation","app.extra_origin"]) expect(second).toContain(`ON ${table} FOR EACH ROW EXECUTE FUNCTION app.mon8_operative_write_guard()`);
});
