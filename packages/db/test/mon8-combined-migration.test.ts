import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const read=(name:string)=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),"utf8");
const first=read("0378_server_plan_entitlements.sql"), second=read("0379_contractor_feature_guards.sql");
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

const identityRoutine=(sql:string,name:string)=>sql.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION identity\\.${name}\\(.*?END \\$\\$;`,"su"))![0];
it("preserves 0347 OIDC registration with only the SSO entitlement check",()=>{
 const expected=identityRoutine(read("0347_oidc_signin.sql"),"oidc_create")
  .replace("CREATE FUNCTION","CREATE OR REPLACE FUNCTION")
  .replace(" PERFORM identity.sso_require_admin(s,t);"," PERFORM app.mon8_require_feature(identity.sso_require_admin(s,t),'sso');");
 expect(identityRoutine(second,"oidc_create")).toBe(expected);
});
it("preserves the full 0347 completion body with only MON-8 commercial-loss changes",()=>{
 const expected=identityRoutine(read("0347_oidc_signin.sql"),"sso_complete")
  .replace("grants_count integer:=0;","grants_count integer:=0; allow_new_grants boolean:=false;")
  .replace(" SELECT count(*) INTO grants_count"," IF member IS NOT NULL THEN allow_new_grants:=(app.mon8_feature_decision(member,'sso')->>'executable')::boolean; END IF;\n SELECT count(*) INTO grants_count")
  .replace("WHERE tenant_id=t AND connection_id=c AND subject_hash=sh AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=t AND v.grant_id=g.grant_id);",
   `WHERE tenant_id=t AND connection_id=c AND subject_hash=sh AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=t AND v.grant_id=g.grant_id)
   AND (allow_new_grants OR NOT EXISTS(
    SELECT 1 FROM app.role_grant old_grant JOIN (
     SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC
    ) mapping ON mapping.role=old_grant.role AND mapping.scope_kind=old_grant.scope_kind AND mapping.scope_id=old_grant.scope_id
    WHERE old_grant.tenant_id=t AND old_grant.id=g.grant_id AND mapping.enabled
    AND mapping.idp_group IN(SELECT jsonb_array_elements_text(claims->'groups'))));`)
  .replace(" IF sub.user_id IS NULL THEN\n  INSERT INTO identity.sso_subject"," IF sub.user_id IS NULL THEN PERFORM app.mon8_require_feature(member,'sso'); allow_new_grants:=true; END IF;\n IF sub.user_id IS NULL THEN\n  INSERT INTO identity.sso_subject")
  .replace("  WHERE enabled AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups')) LOOP","  WHERE enabled AND allow_new_grants AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups')) LOOP");
 expect(identityRoutine(second,"sso_complete")).toBe(expected);
});
