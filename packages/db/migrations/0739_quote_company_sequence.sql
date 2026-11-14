BEGIN;
-- Successor only: CREATE OR REPLACE retains owners and exact ACLs.
CREATE OR REPLACE FUNCTION app.quote_binding_owner_matches(p_tenant uuid,p_owner text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b control_plane.request_binding;
BEGIN
 b:=app.lp6_bound_request();
 RETURN b.tenant_id=p_tenant AND b.scope_job_id IS NULL AND b.scope_command_type IS NULL AND
  CASE WHEN p_owner IS NOT NULL THEN
   b.credential_kind='practice' AND p_owner ~ '^[0-9a-f]{64}$'
    AND b.session_ref=encode(sha256(convert_to('lp6-home:'||p_owner,'UTF8')),'hex')
  ELSE b.credential_kind IN ('real','contractor_practice') END;
END $$;

CREATE OR REPLACE FUNCTION app.allocate_quote_job_reference(p_job uuid) RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b jsonb:=app.bound_context_reader(); t uuid:=(b->>'tenant_id')::uuid;
 owner_digest text; owner_count integer; locked_owner text; locked_count integer; assigned_firm text; firm text; pinned text; result text; n numeric; high numeric;
 saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF t IS NULL OR p_job IS NULL THEN
  RAISE EXCEPTION 'QUOTE_REFERENCE_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT count(*),min(o.owner_digest) INTO owner_count,owner_digest
  FROM app.quote_practice_owners(t) o WHERE o.job_id=p_job;
 IF owner_count>1 OR app.quote_binding_owner_matches(t,owner_digest) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'QUOTE_REFERENCE_REFUSED' USING ERRCODE='42501';
 END IF;
 firm:=CASE WHEN owner_digest IS NULL THEN 'company' ELSE 'practice:'||owner_digest END;
 -- Binding acquired by bind_request FIRST; immutable ownership reads above do
 -- not lock business rows. Take this before any preview/party/job reads.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':quote-firm:'||firm,941));
 PERFORM 1 FROM app.job j WHERE (j.tenant_id,j.id)=(t,p_job) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_REFERENCE_REFUSED' USING ERRCODE='42501'; END IF;
 -- Lock waits can outlive the binding. Revalidate without changing firm locks.
 SELECT count(*),min(o.owner_digest) INTO locked_count,locked_owner
  FROM app.quote_practice_owners(t) o WHERE o.job_id=p_job;
 IF locked_count>1 OR locked_count<>owner_count OR locked_owner IS DISTINCT FROM owner_digest
  OR app.quote_binding_owner_matches(t,locked_owner) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'QUOTE_REFERENCE_REFUSED' USING ERRCODE='42501';
 END IF;
 SELECT a.reference,a.firm_key INTO result,assigned_firm FROM app.quote_job_reference a WHERE (a.tenant_id,a.job_id)=(t,p_job);
 IF FOUND THEN
  IF assigned_firm IS DISTINCT FROM firm THEN RAISE EXCEPTION 'QUOTE_REFERENCE_REFUSED' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
  RETURN result;
 END IF;
 -- Scan every numeric historical artifact, not just the preferred reference.
 -- During the dormant interval old writers may still add legacy previews.
 SELECT coalesce(max(substring(d.reference FROM 3)::numeric),0) INTO high
 FROM app.quote_document_version d WHERE d.tenant_id=t AND d.reference ~ '^Q-[0-9]+$'
  AND CASE WHEN owner_digest IS NULL THEN NOT EXISTS
   (SELECT 1 FROM app.quote_practice_owners(t) o WHERE o.job_id=d.job_id)
  ELSE (SELECT array_agg(o.owner_digest ORDER BY o.owner_digest) FROM app.quote_practice_owners(t) o WHERE o.job_id=d.job_id)=ARRAY[owner_digest] END;
 INSERT INTO app.quote_firm_counter(tenant_id,firm_key,next_number) VALUES(t,firm,high+1)
 ON CONFLICT(tenant_id,firm_key) DO UPDATE SET next_number=greatest(app.quote_firm_counter.next_number,EXCLUDED.next_number);
 -- An issued_at value on a preview does not prove issuance. Keep the latest
 -- actually sent document, even when a newer, unsent preview differs.
 SELECT d.reference INTO pinned FROM app.quote_document_version d
 WHERE (d.tenant_id,d.job_id)=(t,p_job)
 ORDER BY EXISTS(SELECT 1 FROM app.quote_send s WHERE (s.tenant_id,s.job_id,s.document_id)=(t,p_job,d.id)) DESC,
  d.document_version DESC,d.id DESC LIMIT 1;
 IF FOUND THEN
  result:=pinned;
  INSERT INTO app.quote_job_reference(tenant_id,job_id,firm_key,reference,allocation_kind)
   VALUES(t,p_job,firm,result,'legacy');
 ELSE
  UPDATE app.quote_firm_counter SET next_number=next_number+1
   WHERE (tenant_id,firm_key)=(t,firm) RETURNING next_number-1 INTO n;
  result:='Q-'||repeat('0',greatest(0,4-length(n::text)))||n::text;
  INSERT INTO app.quote_job_reference(tenant_id,job_id,firm_key,reference,allocation_kind,allocated_number)
   VALUES(t,p_job,firm,result,'allocated',n);
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN result;
END $$;
COMMIT;
