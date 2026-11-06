BEGIN;
-- ENT-5 Q08: expand-compatible validation for immutable new rule versions.
CREATE OR REPLACE FUNCTION app.valid_approval_rules(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE band jsonb; step jsonb; previous numeric:=-1; limit_value numeric; n integer:=0; count_bands integer; alt jsonb;
BEGIN
 IF jsonb_typeof(d)<>'object' OR d->>'version' IS DISTINCT FROM 'approval-rules.v1'
 OR d-ARRAY['version','proceedLimit','bands','clientApproval','evidence']<>'{}'::jsonb
 OR NOT d ?& ARRAY['version','proceedLimit','bands','clientApproval','evidence']
 OR jsonb_typeof(d->'proceedLimit')<>'object' OR (d->'proceedLimit')-ARRAY['pence','currency']<>'{}'::jsonb
 OR NOT d->'proceedLimit' ?& ARRAY['pence','currency'] OR d->'proceedLimit'->>'currency' IS DISTINCT FROM 'GBP' OR jsonb_typeof(d->'proceedLimit'->'pence')<>'number'
 OR NOT (d->'proceedLimit'->>'pence') ~ '^[0-9]+$' OR (d->'proceedLimit'->>'pence')::numeric>1000000000000
 OR jsonb_typeof(d->'bands')<>'array' OR jsonb_typeof(d->'evidence')<>'object'
 OR (d->'evidence')-ARRAY['photosRequired','residentConfirmationRequired']<>'{}'::jsonb
 OR jsonb_typeof(d->'evidence'->'photosRequired') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'evidence'->'residentConfirmationRequired') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
 count_bands:=jsonb_array_length(d->'bands'); IF count_bands<1 OR count_bands>20 THEN RETURN false; END IF;
 FOR band IN SELECT value FROM jsonb_array_elements(d->'bands') LOOP
  n:=n+1;
  IF jsonb_typeof(band)<>'object' OR band-ARRAY['upToPence','steps']<>'{}'::jsonb OR NOT band ?& ARRAY['upToPence','steps'] OR jsonb_typeof(band->'steps')<>'array' OR jsonb_array_length(band->'steps')>8 THEN RETURN false; END IF;
  IF band->'upToPence'='null'::jsonb THEN IF n<>count_bands THEN RETURN false; END IF;
  ELSE
   IF n=count_bands OR jsonb_typeof(band->'upToPence')<>'number' OR NOT (band->>'upToPence') ~ '^[0-9]+$' THEN RETURN false; END IF;
   limit_value:=(band->>'upToPence')::numeric; IF limit_value<=previous OR limit_value>1000000000000 THEN RETURN false; END IF; previous:=limit_value;
  END IF;
  FOR step IN SELECT value FROM jsonb_array_elements(band->'steps') LOOP
   IF jsonb_typeof(step)<>'object' OR NOT step ?& ARRAY['role','timeLimitMinutes','escalationRole','alternateRoles'] OR step-ARRAY['role','timeLimitMinutes','escalationRole','alternateRoles','waitWorkingDays']<>'{}'::jsonb
   OR jsonb_typeof(step->'role') IS DISTINCT FROM 'string' OR (step->'escalationRole'<>'null'::jsonb AND jsonb_typeof(step->'escalationRole') IS DISTINCT FROM 'string') OR NOT step->>'role'=ANY(ARRAY['supervisor','surveyor','commercial_manager']) OR (step->'escalationRole'<>'null'::jsonb AND NOT step->>'escalationRole'=ANY(ARRAY['supervisor','surveyor','commercial_manager']))
   OR jsonb_typeof(step->'timeLimitMinutes')<>'number' OR NOT (step->>'timeLimitMinutes') ~ '^[0-9]+$' OR (step->>'timeLimitMinutes')::numeric NOT BETWEEN 1 AND 525600
   OR jsonb_typeof(step->'alternateRoles')<>'array' OR jsonb_array_length(step->'alternateRoles')>3 THEN RETURN false; END IF;
   IF step ? 'waitWorkingDays' AND step->'waitWorkingDays'<>'null'::jsonb THEN
    IF jsonb_typeof(step->'waitWorkingDays')<>'number' OR NOT (step->>'waitWorkingDays') ~ '^[0-9]+$'
     OR (step->>'waitWorkingDays')::numeric NOT BETWEEN 1 AND 260 THEN RETURN false; END IF;
   END IF;
   FOR alt IN SELECT value FROM jsonb_array_elements(step->'alternateRoles') LOOP IF jsonb_typeof(alt)<>'string' OR NOT (alt#>>'{}')=ANY(ARRAY['supervisor','surveyor','commercial_manager']) THEN RETURN false; END IF; END LOOP;
  END LOOP;
 END LOOP;
 IF jsonb_typeof(d->'clientApproval')<>'object' THEN RETURN false; END IF;
 IF d->'clientApproval'->>'kind'='none' THEN RETURN (d->'clientApproval')-'kind'='{}'::jsonb; END IF;
 IF d->'clientApproval'->>'kind' IS DISTINCT FROM 'threshold' OR NOT d->'clientApproval' ?& ARRAY['kind','abovePence','beforeWorkAbovePence','timeLimitMinutes'] OR (d->'clientApproval')-ARRAY['kind','abovePence','beforeWorkAbovePence','timeLimitMinutes']<>'{}'::jsonb THEN RETURN false; END IF;
 FOR alt IN SELECT d->'clientApproval'->'abovePence' UNION ALL SELECT d->'clientApproval'->'beforeWorkAbovePence' LOOP IF jsonb_typeof(alt)<>'number' OR NOT (alt#>>'{}') ~ '^[0-9]+$' OR (alt#>>'{}')::numeric>1000000000000 THEN RETURN false; END IF; END LOOP;
 RETURN jsonb_typeof(d->'clientApproval'->'timeLimitMinutes')='number' AND (d->'clientApproval'->>'timeLimitMinutes') ~ '^[0-9]+$' AND (d->'clientApproval'->>'timeLimitMinutes')::numeric BETWEEN 1 AND 525600;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
COMMIT;
