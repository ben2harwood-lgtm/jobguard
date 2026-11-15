BEGIN;
-- Dormant foundation: existing preview/send routines and artifacts are untouched.
CREATE TABLE app.quote_firm_counter (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
 firm_key text NOT NULL CHECK(firm_key ~ '^(practice:[0-9a-f]{64}|company)$'),
 next_number numeric NOT NULL CHECK(next_number >= 1 AND next_number = trunc(next_number) AND next_number < 1e78),
 PRIMARY KEY(tenant_id,firm_key)
);
CREATE TABLE app.quote_job_reference (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, firm_key text NOT NULL,
 reference varchar(80) NOT NULL, allocation_kind text NOT NULL CHECK(allocation_kind IN ('legacy','allocated')),
 allocated_number numeric,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,firm_key) REFERENCES app.quote_firm_counter(tenant_id,firm_key),
 CHECK((allocation_kind='legacy' AND allocated_number IS NULL) OR
  (allocation_kind='allocated' AND allocated_number IS NOT NULL AND allocated_number >= 1 AND allocated_number=trunc(allocated_number)
   AND allocated_number < 1e78 AND reference='Q-'||repeat('0',greatest(0,4-length(allocated_number::text)))||allocated_number::text))
);
CREATE UNIQUE INDEX quote_firm_allocated_number ON app.quote_job_reference(tenant_id,firm_key,allocated_number)
 WHERE allocation_kind='allocated';
-- No runtime SELECT either: tenant scope alone cannot isolate practice firms.
ALTER TABLE app.quote_firm_counter OWNER TO jobguard_migration;
ALTER TABLE app.quote_job_reference OWNER TO jobguard_migration;
ALTER TABLE app.quote_firm_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.quote_firm_counter FORCE ROW LEVEL SECURITY;
ALTER TABLE app.quote_job_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.quote_job_reference FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.quote_firm_counter TO jobguard_migration
 USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation ON app.quote_job_reference TO jobguard_migration
 USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.quote_firm_counter,app.quote_job_reference FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER quote_job_reference_immutable BEFORE UPDATE OR DELETE ON app.quote_job_reference
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

-- Mirrors practiceOwnedJobsSql: v3 wins; v1 requires the succeeded receipt and
-- all three frozen party identities. UNION terminates cycles and repeated paths.
CREATE FUNCTION app.quote_practice_owners(p_tenant uuid) RETURNS TABLE(job_id uuid,owner_digest text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH RECURSIVE owned(job_id,owner_digest) AS (
  SELECT j.id,j.practice_session_digest::text FROM app.job j
   WHERE j.tenant_id=p_tenant AND j.practice_session_digest IS NOT NULL
  UNION
  SELECT j.id,source.owner_digest FROM owned source
  JOIN app.job j ON j.tenant_id=p_tenant AND j.provenance='imported' AND j.practice_session_digest IS NULL
  WHERE EXISTS(SELECT 1 FROM app.job_import_v3 iv
   WHERE iv.tenant_id=p_tenant AND iv.job_id=j.id AND iv.source_job_id=source.job_id)
  OR EXISTS(SELECT 1 FROM app.imported_job_baseline b
   JOIN app.job_party_binding imported ON (imported.tenant_id,imported.job_id,imported.id)=(b.tenant_id,b.job_id,b.party_binding_id)
   JOIN app.job_party_binding origin ON origin.tenant_id=b.tenant_id AND origin.job_id=source.job_id
    AND origin.customer_revision_id=imported.customer_revision_id
    AND origin.site_revision_id=imported.site_revision_id AND origin.paying_party_revision_id=imported.paying_party_revision_id
   WHERE b.tenant_id=p_tenant AND b.job_id=j.id
    AND NOT EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=b.tenant_id AND iv.job_id=b.job_id)
    AND EXISTS(SELECT 1 FROM app.command_receipt rv
     WHERE rv.tenant_id=p_tenant AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||j.id::text AND rv.result->>'jobId'=j.id::text
      AND rv.result->>'sourceJobId'=source.job_id::text))
 ) SELECT * FROM owned
$$;
ALTER FUNCTION app.quote_practice_owners(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.quote_practice_owners(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Boolean only, callable only by the controlled allocator's owner. In particular
-- this does not disclose request_binding or widen bound_context_reader.
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
CREATE FUNCTION app.quote_binding_owner_matches(p_tenant uuid,p_owner text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b control_plane.request_binding;
BEGIN
 b:=app.lp6_bound_request();
 RETURN b.tenant_id=p_tenant AND b.scope_job_id IS NULL AND b.scope_command_type IS NULL AND
  CASE WHEN p_owner IS NOT NULL THEN
   b.credential_kind='practice' AND p_owner ~ '^[0-9a-f]{64}$'
    AND b.session_ref=encode(sha256(convert_to('lp6-home:'||p_owner,'UTF8')),'hex')
  ELSE b.credential_kind='real' AND p_tenant NOT IN
   ('11111111-1111-4111-8111-111111111111'::uuid,'33333333-3333-4333-8333-333333333333'::uuid) END;
END $$;
ALTER FUNCTION app.quote_binding_owner_matches(uuid,text) OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.quote_binding_owner_matches(uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.quote_binding_owner_matches(uuid,text) TO jobguard_migration;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;

CREATE FUNCTION app.allocate_quote_job_reference(p_job uuid) RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b jsonb:=app.bound_context_reader(); t uuid:=(b->>'tenant_id')::uuid;
 owner_digest text; owner_count integer; firm text; pinned text; result text; n numeric; high numeric;
 saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF t IS NULL OR p_job IS NULL THEN
  RAISE EXCEPTION 'QUOTE_REFERENCE_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT count(*),min(o.owner_digest) INTO owner_count,owner_digest
  FROM app.quote_practice_owners(t) o WHERE o.job_id=p_job;
 IF owner_count>1 OR (owner_count=0 AND t IN
  ('11111111-1111-4111-8111-111111111111'::uuid,'33333333-3333-4333-8333-333333333333'::uuid))
  OR NOT app.quote_binding_owner_matches(t,owner_digest) THEN
  RAISE EXCEPTION 'QUOTE_REFERENCE_REFUSED' USING ERRCODE='42501';
 END IF;
 firm:=CASE WHEN owner_digest IS NULL THEN 'company' ELSE 'practice:'||owner_digest END;
 -- Binding acquired by bind_request FIRST; immutable ownership reads above do
 -- not lock business rows. Take this before any preview/party/job reads.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':quote-firm:'||firm,941));
 PERFORM 1 FROM app.job j WHERE (j.tenant_id,j.id)=(t,p_job) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_REFERENCE_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT a.reference INTO result FROM app.quote_job_reference a WHERE (a.tenant_id,a.job_id)=(t,p_job);
 IF FOUND THEN
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
ALTER FUNCTION app.allocate_quote_job_reference(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.allocate_quote_job_reference(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.allocate_quote_job_reference(uuid) TO jobguard_runtime;

-- Reject an allocator-only commit. A new reservation and its first persisted
-- preview must become visible together. Existing operations have no new trigger.
CREATE FUNCTION app.quote_reference_requires_preview() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 IF NOT EXISTS(SELECT 1 FROM app.quote_document_version d
  WHERE (d.tenant_id,d.job_id,d.reference)=(NEW.tenant_id,NEW.job_id,NEW.reference)) THEN
  RAISE EXCEPTION 'QUOTE_REFERENCE_PREVIEW_REQUIRED' USING ERRCODE='23514';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN NULL;
END $$;
ALTER FUNCTION app.quote_reference_requires_preview() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.quote_reference_requires_preview() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER quote_reference_preview_required AFTER INSERT ON app.quote_job_reference
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.quote_reference_requires_preview();
COMMIT;
