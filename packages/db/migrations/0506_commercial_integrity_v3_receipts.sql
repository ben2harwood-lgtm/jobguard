BEGIN;
-- CH6-P: operational feedback only. No old row/column rewrite, role or broad grant.
CREATE FUNCTION app.ch6_integrity_canonical(v jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE result text;
BEGIN
 CASE jsonb_typeof(v)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||app.ch6_integrity_canonical(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(x,',' ORDER BY x COLLATE "C"),'')||']' INTO result FROM (SELECT DISTINCT app.ch6_integrity_canonical(value) COLLATE "C" x FROM jsonb_array_elements(v)) a;
 ELSE result:=v::text;
 END CASE;
 RETURN result;
END $$;

CREATE FUNCTION app.ch6_integrity_authority(t uuid,j uuid,digest text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(digest,t) a;
 IF actor IS NULL OR NOT EXISTS(
  WITH RECURSIVE practice_owned_job AS (
   SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
   UNION SELECT x.id FROM practice_owned_job source
   JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job x ON x.tenant_id=e.tenant_id AND x.id::text=e.subject_ref AND x.provenance='imported' AND x.practice_session_digest IS NULL
  ) SELECT 1 FROM practice_owned_job WHERE id=j
 ) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;

CREATE FUNCTION app.ch6_integrity_family(t uuid,j uuid) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE r record;policies text[];v1 boolean;v3 boolean;
BEGIN
 SELECT x.saved_v1_sample,x.provenance,x.fee_policy_version job_policy,a.fee_policy_version activation_policy,
  q.policy_version terms_policy,q.commercial_track terms_track,c.job_track,c.environment INTO r
 FROM app.job x LEFT JOIN app.job_activation a ON(a.tenant_id,a.job_id)=(x.tenant_id,x.id)
 LEFT JOIN app.job_activation_terms q ON(q.tenant_id,q.job_id)=(x.tenant_id,x.id)
 LEFT JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(x.tenant_id,x.id)
 WHERE x.tenant_id=t AND x.id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 policies:=array_remove(ARRAY[r.job_policy,r.activation_policy,r.terms_policy],NULL);
 IF (r.environment IS NOT NULL AND r.environment<>'synthetic_demo') OR
  (r.terms_track IS NOT NULL AND r.terms_track<>'small_builder') OR (r.job_track IS NOT NULL AND r.job_track<>'small_builder') OR
  EXISTS(SELECT 1 FROM unnest(policies) p WHERE p NOT IN ('reference_fee_policy_v1','reference_fee_policy_v3')) THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 v1:=r.saved_v1_sample OR 'reference_fee_policy_v1'=ANY(policies);v3:='reference_fee_policy_v3'=ANY(policies);
 IF v1 AND v3 THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 IF v1 THEN RETURN 'v1'; END IF;
 IF r.provenance<>'system_generated_quote' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 RETURN 'v3';
END $$;

CREATE FUNCTION app.ch6_integrity_source_fingerprint(t uuid,j uuid,digest text,source_snapshot jsonb) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE facts jsonb;fact jsonb;profile jsonb;win jsonb;expected jsonb;finding_key text;start_at text;end_at text;identity text;
BEGIN
 PERFORM app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 -- The only activated rule is ordinary activity without lock; all other source contracts stay held.
 IF source_snapshot->>'kind' IS DISTINCT FROM 'invoice_or_payment_without_lock' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 SELECT coalesce(jsonb_agg(a.fact),'[]') INTO facts FROM (SELECT jsonb_build_object('source',jsonb_build_object(
 'tenantId',x.tenant_id,'jobId',x.job_id,'scopeId',digest::text,'sourceId',x.id::text,'sourceType',x.kind,
 'revision','1','hash',encode(sha256(convert_to(x.identity,'UTF8')),'hex'),
 'recordedAt',to_char(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'provenance',x.provenance),
 'activityKind',x.activity_kind) fact FROM (
 SELECT i.tenant_id,i.job_id,i.id,i.created_at,'customer_invoice'::text kind,'invoice'::text activity_kind,'server_recorded'::text provenance,
 i.id::text||':'||i.source_hash::text||':'||i.pdf_sha256::text identity FROM app.customer_invoice i WHERE i.tenant_id=t AND i.job_id=j
 UNION ALL SELECT p.tenant_id,p.job_id,p.id,p.created_at,'customer_payment','payment','builder_attested',
 p.id::text||':'||p.invoice_id::text||':'||p.amount_pence::text FROM app.customer_payment p WHERE p.tenant_id=t AND p.job_id=j
 ) x ORDER BY x.kind,x.id) a;
 SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') INTO start_at FROM app.job WHERE tenant_id=t AND id=j;
 SELECT greatest(start_at,coalesce(max(value->'source'->>'recordedAt'),start_at)) INTO end_at FROM jsonb_array_elements(facts);
 win:=jsonb_build_object('start',start_at,'end',end_at);
 profile:=jsonb_build_object('version','synthetic_fixture.persisted-activity.v3','ruleVersion','persisted-activity.1','window',win);
 IF jsonb_array_length(source_snapshot->'facts')<>1 THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 SELECT value INTO fact FROM jsonb_array_elements(facts) WHERE value=source_snapshot->'facts'->0;
 IF fact IS NULL OR fact->'source'->>'recordedAt'<start_at THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 identity:=app.ch6_integrity_canonical(jsonb_build_object('tenantId',t,'jobId',j,'scopeId',digest,'sourceType',fact->'source'->>'sourceType','sourceId',fact->'source'->>'sourceId'));
 finding_key:=app.ch6_integrity_canonical(jsonb_build_object('kind','invoice_or_payment_without_lock','ruleVersion','persisted-activity.1','sources',jsonb_build_array(identity),'window',win));
 expected:=jsonb_build_object('version','commercial-integrity-source-snapshot.v3','tenantId',t,'jobId',j,'scopeId',digest,'family','v3','phase','pre_lock',
  'kind','invoice_or_payment_without_lock','findingKey',finding_key,'profile',profile,'window',win,'facts',jsonb_build_array(fact),
  'compared',jsonb_build_object('lockState','absent','activityKind',fact->>'activityKind'));
 IF expected IS DISTINCT FROM source_snapshot THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 RETURN encode(sha256(convert_to(app.ch6_integrity_canonical(expected),'UTF8')),'hex');
END $$;

CREATE FUNCTION app.ch6_guard_integrity_review_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.command_type='commercial_integrity.review.v3' AND (current_user<>'jobguard_migration' OR NEW.status<>'succeeded') THEN RAISE EXCEPTION 'INTEGRITY_RECEIPT_CONTROLLED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.command_type='commercial_integrity.review.v3' OR (TG_OP='UPDATE' AND NEW.command_type='commercial_integrity.review.v3') THEN RAISE EXCEPTION 'INTEGRITY_RECEIPT_IMMUTABLE' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ch6_integrity_review_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON app.command_receipt
 FOR EACH ROW EXECUTE FUNCTION app.ch6_guard_integrity_review_receipt();
-- Existing runtime DELETE/TRUNCATE denials remain. No table-level privilege is widened.

CREATE FUNCTION app.ch6_append_integrity_review_audit(t uuid,j uuid,actor uuid,command_id uuid,request_hash text,snapshot_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE head record;seq bigint;ts timestamptz;ts_text text;payload jsonb;ph text;eh text;eid uuid:=gen_random_uuid();
BEGIN
 -- Final lock: all source, authority and receipt FK locks have already been acquired.
 SELECT * INTO head FROM app.lock_audit_head();seq:=coalesce(head.sequence,0)+1;
 ts:=date_trunc('milliseconds',clock_timestamp());ts_text:=to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 payload:=jsonb_build_object('references',jsonb_build_object('jobId',j,'commandId',command_id),'hashes',jsonb_build_object('requestHash',request_hash,'snapshotHash',snapshot_hash),'classifications',jsonb_build_object('action','operational'));
 ph:=encode(sha256(convert_to(app.ch6_integrity_canonical(payload),'UTF8')),'hex');
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||actor::text,'commercial_integrity.reviewed.v3','job',j::text,ts_text,ph,coalesce(head.event_hash::text,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(eid,t,seq,'audit.v1','membership:'||actor::text,'commercial_integrity.reviewed.v3','job',j::text,ts,payload,ph,head.event_hash,eh);
 PERFORM app.advance_audit_head(seq,eh::char(64));
 RETURN eid;
END $$;

CREATE FUNCTION app.ch6_record_integrity_review(t uuid,j uuid,digest text,review jsonb,source_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;user_id uuid;cid uuid;rh text;sh text;answer jsonb;prior app.command_receipt;canonical_review jsonb;
BEGIN
 actor:=app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 -- Hold authority rows against revocation; recheck wall-clock expiry after every wait.
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=digest FOR SHARE;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor FOR SHARE;
 PERFORM app.ch6_integrity_authority(t,j,digest);
 SELECT identity_user_id INTO user_id FROM app.authenticate_practice_session(digest,t);
 -- Decode the ECMAScript trim set at execution, avoiding Unicode escape parsing on SQL_ASCII.
 IF jsonb_typeof(review) IS DISTINCT FROM 'object' OR review->>'version' IS DISTINCT FROM 'commercial-integrity-review.v3'
  OR review->>'outcome' IS DISTINCT FROM 'dismissed_false_positive' OR review->>'commandId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR review->>'findingSnapshotHash' !~ '^[a-f0-9]{64}$' OR coalesce(length(review->>'findingKey'),0)=0
  OR (SELECT coalesce(sum((CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END)),0) FROM regexp_split_to_table(review->>'explanation','') ch(c)) NOT BETWEEN 1 AND 500 OR btrim(review->>'explanation',convert_from(decode('090a0b0c0d20c2a0e19a80e28080e28081e28082e28083e28084e28085e28086e28087e28088e28089e2808ae280a8e280a9e280afe2819fe38080efbbbf','hex'),'UTF8')) IS DISTINCT FROM review->>'explanation'
 THEN RAISE EXCEPTION 'INVALID_INTEGRITY_REVIEW'; END IF;
 cid:=(review->>'commandId')::uuid;
 canonical_review:=jsonb_build_object('version','commercial-integrity-review.v3','commandId',cid,'findingKey',review->>'findingKey','findingSnapshotHash',review->>'findingSnapshotHash','outcome','dismissed_false_positive','explanation',review->>'explanation');
 IF canonical_review IS DISTINCT FROM review THEN RAISE EXCEPTION 'INVALID_INTEGRITY_REVIEW'; END IF;
 rh:=encode(sha256(convert_to(app.ch6_integrity_canonical(jsonb_build_object('jobId',j,'membershipId',actor,'identityUserId',user_id,'sessionDigest',digest,'review',review)),'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,627));
 PERFORM app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.command_type<>'commercial_integrity.review.v3' OR prior.status<>'succeeded' OR prior.actor_membership_id<>actor OR prior.semantic_key<>j::text||':'||cid::text OR prior.request_hash<>rh THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN prior.result;
 END IF;
 -- Synthetic-only conservative source locks: block inserts as well as changes to absence predicates.
 -- No new role/grants, no assumption that other writers cooperate with an advisory lock.
 LOCK TABLE app.job,app.job_activation,app.job_activation_terms,app.job_commercial_track,app.customer_invoice,app.customer_payment,app.final_account_lock IN SHARE MODE;
 PERFORM app.ch6_integrity_authority(t,j,digest);
 sh:=app.ch6_integrity_source_fingerprint(t,j,digest,source_snapshot);
 IF sh IS DISTINCT FROM review->>'findingSnapshotHash' OR source_snapshot->>'findingKey' IS DISTINCT FROM review->>'findingKey' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 answer:=review||jsonb_build_object('jobId',j,'membershipId',actor,'identityUserId',user_id,'sessionDigest',digest,'recordedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(cid,t,'commercial_integrity.review.v3',j::text||':'||cid::text,rh,'succeeded',answer,actor,clock_timestamp());
 PERFORM app.ch6_append_integrity_review_audit(t,j,actor,cid,rh,sh);
 -- No later business locks: revalidate expiry/authority with plain reads after the audit-head wait.
 PERFORM app.ch6_integrity_authority(t,j,digest);
 RETURN answer;
END $$;

DO $permissions$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'app.ch6_integrity_canonical(jsonb)','app.ch6_integrity_authority(uuid,uuid,text)','app.ch6_integrity_family(uuid,uuid)',
 'app.ch6_integrity_source_fingerprint(uuid,uuid,text,jsonb)','app.ch6_guard_integrity_review_receipt()',
 'app.ch6_append_integrity_review_audit(uuid,uuid,uuid,uuid,text,text)','app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)'] LOOP
  EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure';
 END LOOP;
END $permissions$;
GRANT EXECUTE ON FUNCTION app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb) TO jobguard_runtime;
COMMIT;
