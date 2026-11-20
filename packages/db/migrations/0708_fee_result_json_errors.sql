-- LATER-SAFETY-28 RED. Preserve latest 0790 body and all existing checks/ACLs.
BEGIN;
CREATE OR REPLACE FUNCTION app.replace_fee_reservation_book(p_tenant uuid, p_book jsonb, p_result jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
DECLARE
  v_old jsonb; v_attempt jsonb; v_next jsonb; v_event record;
  v_audit jsonb; v_index bigint; v_moved bigint := 0;
  v_prior jsonb; v_records jsonb := '[]'; v_seals jsonb := '[]';
  v_changes jsonb := '[]'; v_tail jsonb; v_count bigint; v_revision bigint;
  v_key text; v_field text; v_proof jsonb; v_payload text;
  v_order text[] := ARRAY['pending_submission','submitted','confirmed','paid_out'];
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
  IF p_book - ARRAY['version','attempts','events','audit'] <> '{}'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_each(p_book->'events') e
      WHERE length(e.key)=0 OR jsonb_typeof(e.value) IS DISTINCT FROM 'string'
        OR (e.value #>> '{}') !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'invalid fee book fields' USING ERRCODE='23514';
  END IF;
  -- Match the store's strict attempt boundary so the sole archive writer cannot
  -- be used to poison the next read with an otherwise well-audited malformed row.
  FOR v_next IN SELECT value FROM jsonb_array_elements(p_book->'attempts') LOOP
    IF jsonb_typeof(v_next) IS DISTINCT FROM 'object'
      OR NOT (v_next ?& ARRAY['kind','commandId','fingerprint','actorMembershipId','principalPence','jobId',
        'invoiceId','invoiceHash','sourceHash','statementHash','statementId','amountPence','rail','decisionId',
        'settlementCommandId','settlementObjectId','creditNoteId','state','providerObjectId'])
      OR v_next - ARRAY['version','kind','commandId','fingerprint','actorMembershipId','principalPence','jobId',
        'invoiceId','invoiceHash','sourceHash','statementHash','statementId','amountPence','rail','decisionId',
        'settlementCommandId','settlementObjectId','creditNoteId','state','providerObjectId','paymentState','purpose','authorizationId'] <> '{}'::jsonb
      OR jsonb_typeof(v_next->'kind') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_next->'rail') IS DISTINCT FROM 'string'
      OR v_next->>'kind' NOT IN ('collection','refund')
      OR v_next->>'rail' NOT IN ('stripe_card','direct_debit')
      OR (v_next ? 'version' AND v_next->>'version' IS DISTINCT FROM 'fee-collection.v1')
      OR (v_next ? 'purpose' AND v_next->>'purpose' IS DISTINCT FROM 'receipt_success_fee')
      OR (v_next ? 'paymentState' AND (jsonb_typeof(v_next->'paymentState') IS DISTINCT FROM 'string'
        OR v_next->>'paymentState' NOT IN ('pending_submission','submitted','confirmed','paid_out','failed','cancelled','charged_back','late_failure'))) THEN
      RAISE EXCEPTION 'invalid fee attempt shape' USING ERRCODE='23514';
    END IF;
    FOREACH v_field IN ARRAY ARRAY['commandId','actorMembershipId','jobId','invoiceId','statementId','decisionId',
      'settlementCommandId','creditNoteId','authorizationId'] LOOP
      IF (v_field NOT IN ('settlementCommandId','creditNoteId') OR v_next->v_field <> 'null'::jsonb)
        AND (v_field<>'authorizationId' OR v_next ? v_field)
        AND (jsonb_typeof(v_next->v_field) IS DISTINCT FROM 'string'
          OR v_next->>v_field !~ '^([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$') THEN
        RAISE EXCEPTION 'invalid fee attempt identifier' USING ERRCODE='23514';
      END IF;
    END LOOP;
    FOREACH v_field IN ARRAY ARRAY['fingerprint','invoiceHash','sourceHash','statementHash'] LOOP
      IF jsonb_typeof(v_next->v_field) IS DISTINCT FROM 'string' OR v_next->>v_field !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'invalid fee attempt hash' USING ERRCODE='23514';
      END IF;
    END LOOP;
    FOREACH v_field IN ARRAY ARRAY['principalPence','amountPence'] LOOP
      IF jsonb_typeof(v_next->v_field) IS DISTINCT FROM 'number' OR v_next->>v_field !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'invalid fee money' USING ERRCODE='23514';
      END IF;
      IF (v_next->>v_field)::numeric > 1000000000000 OR (v_field='amountPence' AND (v_next->>v_field)::numeric=0) THEN
        RAISE EXCEPTION 'invalid fee money limit' USING ERRCODE='23514';
      END IF;
    END LOOP;
    FOREACH v_field IN ARRAY ARRAY['providerObjectId','settlementObjectId'] LOOP
      IF jsonb_typeof(v_next->v_field) NOT IN ('string','null') THEN
        RAISE EXCEPTION 'invalid fee provider object' USING ERRCODE='23514';
      END IF;
    END LOOP;
  END LOOP;
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
      IF (v_attempt->'state',v_attempt->'paymentState',v_attempt->'providerObjectId')
        IS DISTINCT FROM (v_next->'state',v_next->'paymentState',v_next->'providerObjectId')
        AND NOT (v_attempt->>'state'='reserved' AND v_next->>'state'='outcome_unknown'
          AND v_attempt->'paymentState' IS NOT DISTINCT FROM v_next->'paymentState'
          AND v_attempt->'providerObjectId' IS NOT DISTINCT FROM v_next->'providerObjectId') THEN
        -- No caller flag or app.* setting grants result authority. A fixture key is
        -- provisioned by the owner; runtime cannot read or replace it. No live rail.
        v_payload := p_result->>'body';
        SELECT signing_secret INTO v_key FROM app.fee_provider_fixture_key
          WHERE tenant_id=p_tenant AND rail=v_next->>'rail';
        IF v_key IS NULL OR v_payload IS NULL OR length(v_payload)>16384
          OR p_result->>'signature' IS DISTINCT FROM encode(public.hmac(v_payload,v_key,'sha256'),'hex') THEN
          RAISE EXCEPTION 'authenticated fee result required' USING ERRCODE='23514';
        END IF;
        BEGIN
          v_proof := v_payload::jsonb;
        EXCEPTION WHEN invalid_text_representation OR untranslatable_character OR statement_too_complex THEN
          RAISE EXCEPTION 'authenticated fee result required' USING ERRCODE='23514';
        END;
        IF v_proof IS DISTINCT FROM jsonb_build_object('version','fake-fee-result.v1',
          'environment','synthetic_demo','tenantId',p_tenant,'attempt',v_next) THEN
          RAISE EXCEPTION 'fee result binding mismatch' USING ERRCODE='23514';
        END IF;
      END IF;
      -- Results authenticate facts, not permission to roll the payment clock back.
      IF v_attempt ? 'paymentState' AND (
        NOT (v_next ? 'paymentState')
        OR (array_position(v_order,v_next->>'paymentState') < array_position(v_order,v_attempt->>'paymentState'))
        OR (v_attempt->>'paymentState' IN ('confirmed','paid_out')
          AND v_next->>'paymentState' IN ('failed','cancelled') AND v_next->>'state'<>'reconciliation_required')
        OR (v_attempt->>'paymentState' IN ('failed','cancelled','charged_back','late_failure')
          AND v_attempt->'paymentState' IS DISTINCT FROM v_next->'paymentState'
          AND NOT (v_attempt->>'paymentState' IN ('failed','cancelled')
            AND v_next->>'paymentState' IN ('failed','cancelled') AND v_next->>'state'='released')
          AND v_next->>'state'<>'reconciliation_required')
      ) THEN RAISE EXCEPTION 'fee payment state moved backwards' USING ERRCODE='23514'; END IF;
      IF v_next->>'paymentState' IN ('charged_back','late_failure')
        AND v_next->>'state'<>'reconciliation_required' THEN
        RAISE EXCEPTION 'fee reversal requires reconciliation' USING ERRCODE='23514';
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
        -- Compaction happens after full-book validation, so a new audit
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
  v_count := (SELECT count(*) FROM app.fee_reservation_archive WHERE tenant_id=p_tenant AND kind='audit');
  -- Derive audit from actual differences, never from the caller's asserted list.
  FOR v_next IN SELECT value FROM jsonb_array_elements(p_book->'attempts') LOOP
    SELECT value INTO v_prior FROM jsonb_array_elements(v_old->'attempts') WHERE value->>'commandId'=v_next->>'commandId';
    IF v_prior IS NULL THEN
      SELECT payload INTO v_prior FROM app.fee_reservation_archive
        WHERE tenant_id=p_tenant AND kind='attempt' AND payload->>'commandId'=v_next->>'commandId'
        ORDER BY split_part(key,':',2)::bigint DESC LIMIT 1;
    END IF;
    IF v_prior IS NULL OR v_prior->>'state' IS DISTINCT FROM v_next->>'state' THEN
      v_changes := v_changes || jsonb_build_array(jsonb_build_object('commandId',v_next->>'commandId','state',v_next->>'state'));
    END IF;
    IF v_prior IS NULL OR (v_prior->'state',v_prior->'paymentState',v_prior->'providerObjectId')
      IS DISTINCT FROM (v_next->'state',v_next->'paymentState',v_next->'providerObjectId') THEN
      v_seals := v_seals || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
        'actorRef',v_next->>'actorMembershipId','eventType',
          CASE WHEN v_prior IS NULL OR v_prior->>'state' IS DISTINCT FROM v_next->>'state'
            THEN 'fee.collection.'||(v_next->>'state') ELSE 'fee.collection.lifecycle' END,
        'subjectType','fee_collection_attempt','subjectRef',v_next->>'commandId',
        'payload',jsonb_build_object('references',jsonb_build_object('invoice',v_next->>'invoiceId','rail',v_next->>'rail','state',v_next->>'state')
          || CASE WHEN v_next ? 'paymentState' THEN jsonb_build_object('paymentState',v_next->>'paymentState') ELSE '{}'::jsonb END,
          'hashes',jsonb_build_object('fingerprint',v_next->>'fingerprint'),
          'classifications',jsonb_build_object('action','financial'))));
    END IF;
    IF v_next->>'state'='released' THEN
      SELECT payload,split_part(key,':',2)::bigint INTO v_prior,v_revision FROM app.fee_reservation_archive
        WHERE tenant_id=p_tenant AND kind='attempt' AND payload->>'commandId'=v_next->>'commandId'
        ORDER BY split_part(key,':',2)::bigint DESC LIMIT 1;
      IF v_prior IS DISTINCT FROM v_next THEN
        v_records := v_records || jsonb_build_array(jsonb_build_object('kind','attempt',
          'key',(v_next->>'commandId')||':'||coalesce(v_revision+1,0)::text,'payload',v_next));
      END IF;
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY n),'[]') INTO v_tail
    FROM jsonb_array_elements(p_book->'audit') WITH ORDINALITY a(value,n)
    WHERE n>greatest(v_count,jsonb_array_length(v_old->'audit'));
  IF v_tail IS DISTINCT FROM v_changes THEN
    RAISE EXCEPTION 'fee audit does not match state changes' USING ERRCODE='23514';
  END IF;
  FOR v_event IN SELECT key,value FROM jsonb_each(p_book->'events') LOOP
    IF NOT EXISTS (SELECT 1 FROM app.fee_reservation_archive WHERE tenant_id=p_tenant AND kind='event' AND key=v_event.key) THEN
      -- Previously stored keys may compact unchanged without new authority.
      IF NOT (v_old->'events' ? v_event.key) THEN
        -- New keys require a signed result bound to an attempt in this exact book,
        -- including no-op provider results. Unsigned callers cannot reserve inbox keys.
        v_payload := p_result->>'body';
        IF v_payload IS NULL OR length(v_payload)>16384 THEN
          RAISE EXCEPTION 'authenticated fee event required' USING ERRCODE='23514';
        END IF;
        BEGIN
          v_proof := v_payload::jsonb;
        EXCEPTION WHEN invalid_text_representation OR untranslatable_character OR statement_too_complex THEN
          RAISE EXCEPTION 'authenticated fee event required' USING ERRCODE='23514';
        END;
        v_next := v_proof->'attempt';
        SELECT signing_secret INTO v_key FROM app.fee_provider_fixture_key
          WHERE tenant_id=p_tenant AND rail=v_next->>'rail';
        IF v_key IS NULL
          OR p_result->>'signature' IS DISTINCT FROM encode(public.hmac(v_payload,v_key,'sha256'),'hex')
          OR v_proof IS DISTINCT FROM jsonb_build_object('version','fake-fee-result.v1',
            'environment','synthetic_demo','tenantId',p_tenant,'attempt',v_next)
          OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_book->'attempts') a WHERE a=v_next)
          OR split_part(v_event.key,':',1) IS DISTINCT FROM v_next->>'rail' THEN
          RAISE EXCEPTION 'fee event binding mismatch' USING ERRCODE='23514';
        END IF;
        v_seals := v_seals || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
          'actorRef',v_next->>'actorMembershipId','eventType','fee.collection.webhook_recorded',
          'subjectType','fee_collection_attempt','subjectRef',v_next->>'commandId',
          'payload',jsonb_build_object('references',jsonb_build_object('invoice',v_next->>'invoiceId','rail',v_next->>'rail'),
            'hashes',jsonb_build_object('event',v_event.value #>> '{}'),
            'classifications',jsonb_build_object('action','financial'))));
      END IF;
      v_records := v_records || jsonb_build_array(jsonb_build_object('kind','event','key',v_event.key,'payload',v_event.value));
    END IF;
  END LOOP;
  FOR v_audit,v_index IN SELECT value,n-1 FROM jsonb_array_elements(p_book->'audit') WITH ORDINALITY a(value,n) LOOP
    IF v_index>=v_count THEN
      v_records := v_records || jsonb_build_array(jsonb_build_object('kind','audit','key',v_index::text,'payload',v_audit));
    END IF;
  END LOOP;
  UPDATE app.fee_reservation_book SET book=jsonb_build_object('version','fee-reservation-book.v1',
    'attempts',(SELECT coalesce(jsonb_agg(a),'[]') FROM jsonb_array_elements(p_book->'attempts') a WHERE a->>'state'<>'released'),
    'events','{}'::jsonb,'audit','[]'::jsonb) WHERE tenant_id=p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'fee book not replaced' USING ERRCODE='42501'; END IF;
  -- Archive first; the audit head remains the final contending lock.
  PERFORM app.seal_fee_reservation_change(p_tenant,v_records,v_seals);
END;
$$;
COMMIT;
