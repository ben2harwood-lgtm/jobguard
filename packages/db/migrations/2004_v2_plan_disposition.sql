BEGIN;

DO $v2$
DECLARE
  routine regprocedure;
  demo_literal constant text := quote_literal('jobguard_synthetic_demo');
  v2_literal constant text := quote_literal('jobguard_v2_local');
  definition text;
  fence integer;
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  -- Reuse the exact disposition command with its current owner, ACL and authorization checks.
  routine := 'app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone,uuid,uuid)'::regprocedure;
  definition := pg_get_functiondef(routine);
  IF strpos(definition, v2_literal) > 0 THEN RETURN; END IF;
  fence := strpos(definition, demo_literal);
  IF fence = 0 THEN RAISE EXCEPTION 'Expected local database fence missing in %', routine; END IF;
  EXECUTE overlay(definition PLACING v2_literal FROM fence FOR length(demo_literal));
END
$v2$;
COMMIT;
