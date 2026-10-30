BEGIN;
-- Append a counted projection beside the held foundation, never overwrite it.
ALTER TABLE app.meter_lifecycle_computation
 DROP CONSTRAINT meter_lifecycle_computation_recipe_version_check,
 DROP CONSTRAINT meter_lifecycle_computation_status_check,
 DROP CONSTRAINT meter_lifecycle_computation_tenant_id_scope_id_source_id_key,
 ADD CONSTRAINT meter_lifecycle_computation_recipe_status_check CHECK (
  (recipe_version='specified-foundation.v1' AND status='held') OR
  (recipe_version='london-midnight-stops.v1' AND status='counted')),
 ADD UNIQUE(tenant_id,scope_id,source_id,recipe_version);
ALTER TABLE app.meter_lifecycle_day_ledger
 DROP CONSTRAINT meter_lifecycle_day_ledger_status_check,
 ADD COLUMN result jsonb,
 ADD CONSTRAINT meter_lifecycle_day_result_check CHECK ((
  (status='held' AND result IS NULL) OR
  (status='counted' AND result IS NOT NULL AND jsonb_typeof(result)='object'
   AND result->>'date' IS NOT NULL AND result->>'date'=date::text
   AND jsonb_typeof(result->'places')='array'
   AND jsonb_typeof(result->'rawPlaces')='number'
   AND jsonb_typeof(result->'freeSmallPlaces')='number'
   AND jsonb_typeof(result->'countedPlaces')='number'
   AND (result->>'rawPlaces')::integer>=0
   AND (result->>'freeSmallPlaces')::integer>=0
   AND (result->>'countedPlaces')::integer>=0
   AND (result->>'rawPlaces')::integer=jsonb_array_length(result->'places')
   AND (result->>'countedPlaces')::integer=(result->>'rawPlaces')::integer-(result->>'freeSmallPlaces')::integer)) IS TRUE);
-- Preserve the old held API's selection now that each source has two recipes.
DO $$
DECLARE definition text; amended text;
BEGIN
 definition:=pg_get_functiondef('app.mon1_lifecycle_rebuild(uuid,text,uuid)'::regprocedure);
 amended:=replace(definition,
  'SELECT id INTO c FROM app.meter_lifecycle_computation WHERE (tenant_id,scope_id,source_id)=(t,s.scope_id,s.id);',
  'SELECT id INTO c FROM app.meter_lifecycle_computation WHERE (tenant_id,scope_id,source_id)=(t,s.scope_id,s.id) AND recipe_version=''specified-foundation.v1'';');
 IF amended=definition THEN RAISE EXCEPTION 'unexpected lifecycle rebuild definition'; END IF;
 -- Preserve exact owner, grants, search path and bootstrap security posture.
 EXECUTE amended;
END $$;
COMMIT;
