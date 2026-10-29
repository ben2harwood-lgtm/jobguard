BEGIN;
-- Bind new synthetic approvals to the exact server-rendered consent text.
-- Existing immutable approvals and successful command receipts remain unchanged.
DO $migration$
DECLARE definition text; original text;
BEGIN
 SELECT pg_get_functiondef('app.mon2_command(uuid,text,uuid,jsonb)'::regprocedure) INTO original;
 definition := replace(original,$old$approval_hash:=app.final_lock_hash((v-ARRAY['version','kind','contentHash'])||jsonb_build_object('tenantId',t));$old$,$new$approval_hash:=app.final_lock_hash((v-ARRAY['version','kind','contentHash'])||jsonb_build_object('tenantId',t,'consentText','Made-up company demonstration only. No real payments are taken. Monthly principal excluding VAT: Solo £29.00, including 4 jobs, maximum £49.00; Builder £69.00, including 7 jobs, maximum £169.00. Annual plans are unavailable. The selected plan, billing anchor and monthly maximum apply. Upgrades apply today. Downgrades are requested for the next billing boundary and depend on available capacity. Issued periods cannot be changed.'));$new$);
 IF definition = original THEN RAISE EXCEPTION 'MON2_CONSENT_PATCH_TARGET_MISSING'; END IF;
 EXECUTE definition;
END $migration$;
COMMIT;
