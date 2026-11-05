-- FEE-STORE-UPDATE-GRANT. Forward fix; no result-authenticity claim.
BEGIN;
REVOKE UPDATE(book) ON app.fee_reservation_book FROM jobguard_runtime;
ALTER POLICY tenant_isolation ON app.fee_reservation_book TO jobguard_runtime, jobguard_migration;
-- Runtime INSERT is bootstrap only. This restrictive policy also applies when
-- table-level INSERT lets a caller explicitly supply the book column.
CREATE POLICY empty_book_insert ON app.fee_reservation_book AS RESTRICTIVE
  FOR INSERT TO jobguard_runtime
  WITH CHECK (book = '{"version":"fee-reservation-book.v1","attempts":[],"events":{},"audit":[]}'::jsonb);

-- FORCE RLS also applies to the SECURITY DEFINER owner. Read only this tenant's history.
CREATE POLICY migration_tenant_select ON app.fee_reservation_archive
  FOR SELECT TO jobguard_migration
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE FUNCTION app.lock_fee_reservation_book(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
DECLARE v_book jsonb;
BEGIN
  IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'fee book tenant mismatch' USING ERRCODE='42501';
  END IF;
  SELECT book INTO STRICT v_book FROM app.fee_reservation_book WHERE tenant_id=p_tenant FOR UPDATE;
  RETURN v_book;
END;
$$;

CREATE FUNCTION app.replace_fee_reservation_book(p_tenant uuid, p_book jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
DECLARE
  v_old jsonb; v_attempt jsonb; v_next jsonb; v_event record;
  v_audit jsonb; v_index bigint; v_moved bigint := 0;
BEGIN
  IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
    RAISE EXCEPTION 'fee book tenant mismatch' USING ERRCODE='42501';
  END IF;
  SELECT book INTO STRICT v_old FROM app.fee_reservation_book WHERE tenant_id=p_tenant FOR UPDATE;
  IF p_book IS NULL OR jsonb_typeof(p_book) IS DISTINCT FROM 'object'
    OR p_book->>'version' IS DISTINCT FROM 'fee-reservation-book.v1'
    OR jsonb_typeof(p_book->'attempts') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_book->'events') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_book->'audit') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid fee book' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_book->'attempts') a
    GROUP BY a->>'commandId' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'duplicate fee attempt' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_book->'attempts') a
    WHERE jsonb_typeof(a) IS DISTINCT FROM 'object' OR a->>'commandId' IS NULL
      OR a->>'state' IS NULL OR a->>'state' NOT IN
        ('reserved','outcome_unknown','provider_accepted','settled','released','reconciliation_required')) THEN
    RAISE EXCEPTION 'invalid fee attempt' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_book->'attempts') a
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_old->'attempts') old
      WHERE old->>'commandId'=a->>'commandId')
    AND NOT EXISTS (SELECT 1 FROM app.fee_reservation_archive WHERE tenant_id=p_tenant AND kind='attempt'
      AND payload->>'commandId'=a->>'commandId')
    AND a->>'state'<>'reserved') THEN
    RAISE EXCEPTION 'new fee attempt must be reserved' USING ERRCODE='23514';
  END IF;
  FOR v_attempt IN
    SELECT value FROM jsonb_array_elements(v_old->'attempts')
    UNION ALL
    SELECT payload FROM (
      SELECT DISTINCT ON (payload->>'commandId') payload FROM app.fee_reservation_archive
      WHERE tenant_id=p_tenant AND kind='attempt'
      ORDER BY payload->>'commandId', (split_part(key,':',2))::bigint DESC
    ) archived WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_old->'attempts') a
      WHERE a->>'commandId'=archived.payload->>'commandId')
  LOOP
    SELECT value INTO v_next FROM jsonb_array_elements(p_book->'attempts')
      WHERE value->>'commandId'=v_attempt->>'commandId';
    IF v_next IS NULL THEN
      IF v_attempt->>'state' IS DISTINCT FROM 'released' OR NOT EXISTS (
        SELECT 1 FROM app.fee_reservation_archive WHERE tenant_id=p_tenant AND kind='attempt'
          AND key ~ ('^' || (v_attempt->>'commandId') || ':(0|[1-9][0-9]*)$') AND payload=v_attempt
      ) THEN RAISE EXCEPTION 'fee attempt removed' USING ERRCODE='23514'; END IF;
    ELSE
      -- Exactly identity() in PostgresReservationStore: every field except these three.
      IF (v_attempt - ARRAY['state','paymentState','providerObjectId'])
        IS DISTINCT FROM (v_next - ARRAY['state','paymentState','providerObjectId']) THEN
        RAISE EXCEPTION 'fee attempt identity rewritten' USING ERRCODE='23514';
      END IF;
      IF v_attempt->>'state' IS DISTINCT FROM v_next->>'state' THEN
        -- Explicit executor.ts transition edges (same-state lifecycle updates are allowed).
        IF NOT ((v_attempt->>'state',v_next->>'state') IN (
          ('reserved','outcome_unknown'),
          ('outcome_unknown','provider_accepted'), ('outcome_unknown','released'),
          ('outcome_unknown','settled'), ('outcome_unknown','reconciliation_required'),
          ('provider_accepted','settled'), ('provider_accepted','released'),
          ('provider_accepted','reconciliation_required'),
          ('settled','reconciliation_required'),
          ('released','reconciliation_required')
        )) THEN RAISE EXCEPTION 'invalid fee attempt transition' USING ERRCODE='23514'; END IF;
        -- Compaction happens after this full-book replacement, so a new audit
        -- entry must be present in the appended tail of this very call.
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_book->'audit') WITH ORDINALITY a(value,n)
          WHERE n>greatest(jsonb_array_length(v_old->'audit'),
            (SELECT count(*) FROM app.fee_reservation_archive WHERE tenant_id=p_tenant AND kind='audit'))
            AND value=jsonb_build_object('commandId',v_next->>'commandId','state',v_next->>'state')) THEN
          RAISE EXCEPTION 'fee transition missing audit' USING ERRCODE='23514';
        END IF;
      END IF;
    END IF;
  END LOOP;
  FOR v_event IN
    SELECT key,value FROM jsonb_each(v_old->'events')
    UNION ALL SELECT key,payload FROM app.fee_reservation_archive WHERE tenant_id=p_tenant AND kind='event'
  LOOP
    IF p_book->'events'->v_event.key IS DISTINCT FROM v_event.value AND NOT (
      NOT (p_book->'events' ? v_event.key) AND EXISTS (
        SELECT 1 FROM app.fee_reservation_archive WHERE tenant_id=p_tenant AND kind='event'
          AND key=v_event.key AND payload=v_event.value)) THEN
      RAISE EXCEPTION 'fee event rewritten' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF jsonb_array_length(p_book->'audit')>0 AND EXISTS (
    SELECT 1 FROM app.fee_reservation_archive WHERE tenant_id=p_tenant AND kind='audit'
      AND p_book->'audit'->(key::integer) IS DISTINCT FROM payload
  ) THEN RAISE EXCEPTION 'archived fee audit rewritten' USING ERRCODE='23514'; END IF;
  -- Only a prefix can move to archive; the surviving suffix stays byte-identical
  -- and in order. Full books use absolute archive ordinals, as compact() does.
  FOR v_audit,v_index IN SELECT value,n-1 FROM jsonb_array_elements(v_old->'audit') WITH ORDINALITY a(value,n) LOOP
    IF EXISTS (SELECT 1 FROM app.fee_reservation_archive WHERE tenant_id=p_tenant
      AND kind='audit' AND key=v_index::text AND payload=v_audit) THEN
      v_moved := v_moved+1;
    ELSE EXIT;
    END IF;
  END LOOP;
  -- Prefer retaining the complete prefix when both representations are possible.
  IF (SELECT coalesce(jsonb_agg(value ORDER BY n),'[]'::jsonb)
      FROM jsonb_array_elements(p_book->'audit') WITH ORDINALITY a(value,n)
      WHERE n<=jsonb_array_length(v_old->'audit')) IS DISTINCT FROM v_old->'audit' THEN
    IF (SELECT coalesce(jsonb_agg(value ORDER BY n),'[]'::jsonb)
        FROM jsonb_array_elements(v_old->'audit') WITH ORDINALITY a(value,n) WHERE n>v_moved)
      IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY n),'[]'::jsonb)
        FROM jsonb_array_elements(p_book->'audit') WITH ORDINALITY a(value,n)
        WHERE n<=jsonb_array_length(v_old->'audit')-v_moved) THEN
      RAISE EXCEPTION 'fee audit rewritten' USING ERRCODE='23514';
    END IF;
  END IF;
  UPDATE app.fee_reservation_book SET book=p_book WHERE tenant_id=p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'fee book not replaced' USING ERRCODE='42501'; END IF;
END;
$$;
ALTER FUNCTION app.lock_fee_reservation_book(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.replace_fee_reservation_book(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lock_fee_reservation_book(uuid), app.replace_fee_reservation_book(uuid,jsonb)
  FROM PUBLIC, jobguard_runtime, jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lock_fee_reservation_book(uuid), app.replace_fee_reservation_book(uuid,jsonb) TO jobguard_runtime;
COMMIT;
