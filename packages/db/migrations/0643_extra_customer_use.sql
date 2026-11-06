BEGIN;
-- Same cookie, credential format, HMAC and route as customer sign-in. A credential
-- here identifies a named client membership, never the invitation's sponsor.
CREATE FUNCTION identity.extra_customer_use(t uuid,j uuid,c uuid,digest text,session_digest text,operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k app.extra_client_link; s app.extra_client_session; closed text; sid uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR operation IS NULL OR operation NOT IN('redeem','resolve','signout') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 -- Same order as approval/withdraw: shared tenant lock, then job lock, then audit.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,417));
 IF operation='redeem' THEN
  SELECT l.* INTO k FROM app.extra_client_signin b JOIN app.extra_client_link l ON(l.tenant_id,l.id)=(b.tenant_id,b.link_id)
   WHERE b.tenant_id=t AND b.signin_digest=digest;
 ELSE
  SELECT * INTO s FROM app.extra_client_session WHERE tenant_id=t AND token_digest=digest;
  SELECT * INTO k FROM app.extra_client_link WHERE tenant_id=t AND id=s.link_id;
 END IF;
 -- No match delegates to the unchanged customer sign-in implementation.
 IF k.id IS NULL THEN RETURN NULL; END IF;
 IF k.job_id<>j OR k.approver_membership_id<>c THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.xa_client_view_authority(j,k.request_id,c,k.recipient);
 PERFORM app.mon8_require_feature(c,'approval_chains');
 SELECT kind INTO closed FROM app.extra_client_link_closure WHERE tenant_id=t AND link_id=k.id;
 IF closed IN('revoked','replaced') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF operation='redeem' THEN
  IF closed IS NOT NULL OR clock_timestamp()>=k.expires_at OR session_digest IS NULL OR session_digest !~ '^[a-f0-9]{64}$'
   OR EXISTS(SELECT 1 FROM app.extra_client_session WHERE tenant_id=t AND link_id=k.id) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  INSERT INTO app.extra_client_session(tenant_id,id,link_id,token_digest,expires_at) VALUES(t,sid,k.id,session_digest,clock_timestamp()+interval '1 hour');
  PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||c::text,j,'contractor.extra.client_signed_in',jsonb_build_object('sessionId',sid,'linkId',k.id));
 ELSE
  IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  IF operation='signout' THEN
   UPDATE app.extra_client_session SET revoked_at=clock_timestamp() WHERE tenant_id=t AND id=s.id;
   PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||c::text,j,'contractor.extra.client_signed_out',jsonb_build_object('sessionId',s.id));
  END IF;
 END IF;
 RETURN jsonb_build_object('version','customer-session.v1','jobId',j,'customerId',c,'extraApprover',true);
END $$;
ALTER FUNCTION identity.extra_customer_use(uuid,uuid,uuid,text,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.extra_customer_use(uuid,uuid,uuid,text,text,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION identity.extra_customer_use(uuid,uuid,uuid,text,text,text) TO jobguard_identity;
COMMIT;
