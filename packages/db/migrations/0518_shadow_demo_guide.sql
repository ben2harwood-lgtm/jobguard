BEGIN;
-- DEMO-J3 click-through (1 Nov 2026). Demo-only helpers: each refuses outside the
-- synthetic database and needs the practice session that owns the job. No general
-- route, no new builder-visible hidden fact before lock.
CREATE TABLE infrastructure.demo_source_hold_request(id uuid PRIMARY KEY, tenant_id uuid NOT NULL, job_id uuid NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(), enqueued_at timestamptz, finished_at timestamptz);
ALTER TABLE infrastructure.demo_source_hold_request OWNER TO jobguard_migration;
GRANT SELECT,UPDATE ON infrastructure.demo_source_hold_request TO jobguard_infrastructure;

-- Pre-lock worker request. Its answer depends only on the request, never on what the worker holds.
CREATE FUNCTION app.demo_request_source_hold(t uuid,j uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
DECLARE actor record; request uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM app.final_check_builder(t,j,d);
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'DEMO_SOURCE_HOLD_LOCKED' USING ERRCODE='P0001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'DEMO_SOURCE_HOLD_TERMS_REQUIRED' USING ERRCODE='P0001'; END IF;
 SELECT id INTO request FROM infrastructure.demo_source_hold_request WHERE tenant_id=t AND job_id=j AND finished_at IS NULL;
 IF request IS NULL THEN
  request:=gen_random_uuid();
  INSERT INTO infrastructure.demo_source_hold_request(id,tenant_id,job_id) VALUES(request,t,j);
 END IF;
 RETURN jsonb_build_object('version','demo-source-hold.v1','state','requested','realExternalActions',0);
END $$;
ALTER FUNCTION app.demo_request_source_hold(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.demo_request_source_hold(uuid,uuid,text) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.demo_request_source_hold(uuid,uuid,text) TO jobguard_runtime;

CREATE FUNCTION app.demo_source_hold_state(t uuid,j uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
DECLARE actor record; r infrastructure.demo_source_hold_request;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM app.final_check_builder(t,j,d);
 SELECT * INTO r FROM infrastructure.demo_source_hold_request WHERE tenant_id=t AND job_id=j ORDER BY requested_at DESC LIMIT 1;
 RETURN jsonb_build_object('version','demo-source-hold.v1','realExternalActions',0,
  'state',CASE WHEN r.id IS NULL THEN 'not_requested' WHEN r.finished_at IS NULL THEN 'requested' ELSE 'finished' END);
END $$;
ALTER FUNCTION app.demo_source_hold_state(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.demo_source_hold_state(uuid,uuid,text) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.demo_source_hold_state(uuid,uuid,text) TO jobguard_runtime;

-- Same writes as identity.customer_portal_issue; the issuer is the practice owner of this
-- job instead of an identity session. The caller gets the fake-delivery path it built.
CREATE FUNCTION app.demo_issue_customer_link(t uuid,j uuid,c uuid,session_digest text,link_digest text,content text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor record; m app.membership; b app.job_party_binding; recipient text; g uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); ts timestamptz; hash text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM app.final_check_builder(t,j,session_digest);
 -- Narrow: only the practice tenant, only after lock, only while a found extra exists for the customer to review.
 IF t<>'11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j)
  OR NOT EXISTS(SELECT 1 FROM app.extra_origin WHERE tenant_id=t AND job_id=j AND kind='jobguard_catch') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 SELECT * INTO m FROM app.membership WHERE tenant_id=t AND id=actor.member_id AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 SELECT bnd.* INTO b FROM app.job_party_current pc JOIN app.job_party_binding bnd ON(bnd.tenant_id,bnd.job_id,bnd.id)=(pc.tenant_id,pc.job_id,pc.binding_id)
 WHERE pc.tenant_id=t AND pc.job_id=j AND bnd.customer_id=c FOR SHARE OF pc;
 SELECT lower(payload->>'email') INTO recipient FROM app.customer_revision WHERE tenant_id=t AND id=b.customer_revision_id;
 IF b.id IS NULL OR recipient IS NULL OR recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$' OR link_digest IS NULL OR link_digest !~ '^[a-f0-9]{64}$'
  OR content IS NULL OR length(content)>4096 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF content !~ ('^/customer/sign-in#'||t::text||'/'||j::text||'/'||c::text||'/[A-Za-z0-9_-]{43}$') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 ts:=clock_timestamp();
 IF EXISTS(SELECT 1 FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j AND issued_at>ts-interval '1 minute') THEN RAISE EXCEPTION 'CUSTOMER_LINK_RATE_LIMITED' USING ERRCODE='P0001'; END IF;
 UPDATE app.action_outbox SET status='cancelled',updated_at=ts WHERE tenant_id=t AND id IN(SELECT outbox_id FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j) AND status IN('pending','retryable');
 UPDATE app.customer_portal_grant SET revoked_at=ts WHERE tenant_id=t AND job_id=j AND revoked_at IS NULL;
 hash:=encode(sha256(convert_to(content,'UTF8')),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(d,t,'customer_portal',g::text,'customer_portal.signin.send');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(r,t,d,'approved',m.id);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
 VALUES(a,t,d,r,m.id,'customer_portal.signin.send',recipient,hash,b.revision,'customer-signin.synthetic.v1',ts+interval '10 minutes');
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at)
 VALUES(o,t,a,'fake_email','customer-signin:'||g::text,'customer_portal.signin.send',recipient,hash,content,b.revision,'customer-signin.synthetic.v1',ts+interval '10 minutes');
 INSERT INTO app.customer_portal_grant(tenant_id,id,company_id,job_id,customer_id,party_binding_id,customer_revision_id,token_digest,issuer_membership_id,outbox_id,issued_at,expires_at)
 VALUES(t,g,m.account_id,j,c,b.id,b.customer_revision_id,link_digest,m.id,o,ts,ts+interval '10 minutes');
 IF NOT app.customer_portal_current((SELECT x FROM app.customer_portal_grant x WHERE tenant_id=t AND id=g)) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.customer_portal_audit(t,g,'issued');
 RETURN g;
END $$;
ALTER FUNCTION app.demo_issue_customer_link(uuid,uuid,uuid,text,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.demo_issue_customer_link(uuid,uuid,uuid,text,text,text) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.demo_issue_customer_link(uuid,uuid,uuid,text,text,text) TO jobguard_runtime;

-- After lock only, and only for catches the builder has already confirmed into a case.
CREATE FUNCTION app.demo_shadow_review_inputs(t uuid,j uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE actor record; rows jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM app.final_check_builder(t,j,d);
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED' USING ERRCODE='P0001'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('caseId',c.id,'workId',s.work_id,
   'assessmentId',latest.assessment_id,'reviewArtifactHash',latest.hash) ORDER BY c.id),'[]') INTO rows
 FROM app.recovery_case_current c
 JOIN LATERAL jsonb_array_elements_text(to_jsonb(c.source_refs)) ref(value) ON ref.value LIKE 'signal:%'
 JOIN app.shadow_commercial_signal s ON s.tenant_id=c.tenant_id AND s.job_id=c.job_id AND s.id=substr(ref.value,8)::uuid
 LEFT JOIN LATERAL (SELECT r.document->>'assessmentId' assessment_id,app.final_lock_hash(r.document) hash FROM app.recovery_attribution_revision r
  WHERE r.tenant_id=c.tenant_id AND r.job_id=c.job_id AND r.case_id=c.id ORDER BY r.revision DESC LIMIT 1) latest ON true
 WHERE c.tenant_id=t AND c.job_id=j AND c.case_type='missed_variation_final_account';
 RETURN jsonb_build_object('version','demo-shadow-review-inputs.v1','realExternalActions',0,'cases',rows);
END $$;
ALTER FUNCTION app.demo_shadow_review_inputs(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.demo_shadow_review_inputs(uuid,uuid,text) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.demo_shadow_review_inputs(uuid,uuid,text) TO jobguard_runtime;
COMMIT;
