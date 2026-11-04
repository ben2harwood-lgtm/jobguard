BEGIN;
-- Historical advisory reads use exactly the existing detail authority, never list or fee authority.
CREATE FUNCTION app.lp_office_signals(p_session uuid, p_job uuid, p_limit integer DEFAULT 50, p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 t uuid := nullif(current_setting('app.tenant_id',true),'')::uuid;
 cursor_time timestamptz;
 result jsonb;
BEGIN
 PERFORM app.lp_authority(p_session,p_job,'detail');
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'INVALID_PROMPT_COMMAND';
 END IF;
 IF p_after IS NOT NULL THEN
  SELECT s.recorded_at INTO cursor_time FROM app.extra_office_prompt_signal s
  WHERE s.tenant_id=t AND s.job_id=p_job AND s.id=p_after;
  IF cursor_time IS NULL THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(q.document ORDER BY q.recorded_at,q.id),'[]'::jsonb) INTO result FROM (
  SELECT s.id,s.recorded_at,jsonb_build_object('promptId',s.prompt_id,'variationId',s.variation_id,'recordedAt',s.recorded_at) document
  FROM app.extra_office_prompt_signal s
  WHERE s.tenant_id=t AND s.job_id=p_job
   AND (p_after IS NULL OR (s.recorded_at,s.id)>(cursor_time,p_after))
  ORDER BY s.recorded_at,s.id LIMIT p_limit+1
 ) q;
 -- The opaque cursor identifies the last emitted signal; it exposes no additional item fields.
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(result)>p_limit THEN result-p_limit ELSE result END,
  'nextCursor',CASE WHEN jsonb_array_length(result)>p_limit THEN
   (SELECT s.id FROM app.extra_office_prompt_signal s WHERE s.tenant_id=t AND s.job_id=p_job
    AND (p_after IS NULL OR (s.recorded_at,s.id)>(cursor_time,p_after))
    ORDER BY s.recorded_at,s.id OFFSET p_limit-1 LIMIT 1) ELSE NULL END);
END $$;
ALTER FUNCTION app.lp_office_signals(uuid,uuid,integer,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp_office_signals(uuid,uuid,integer,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.lp_office_signals(uuid,uuid,integer,uuid) TO jobguard_runtime;
COMMIT;
