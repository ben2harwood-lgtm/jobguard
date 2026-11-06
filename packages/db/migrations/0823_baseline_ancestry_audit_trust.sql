-- LATER-SAFETY-87: bind imported-job ancestry to the trusted adoption aggregate.
-- Forward fix; no historical events, owners, privileges or audit writers change.
BEGIN;

CREATE OR REPLACE FUNCTION app.ch6_integrity_authority(t uuid,j uuid,digest text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(digest,t) a;
 IF actor IS NULL OR NOT EXISTS(
  WITH RECURSIVE practice_owned_job AS (
   SELECT id FROM app.job WHERE tenant_id=t AND id=j
   UNION SELECT parent.id FROM practice_owned_job source
   JOIN app.job child ON child.tenant_id=t AND child.id=source.id AND child.provenance='imported' AND child.practice_session_digest IS NULL
   JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.subject_ref=child.id::text
   JOIN app.job parent ON parent.tenant_id=t AND parent.id::text=e.payload->'references'->>'sourceJobId' AND EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=child.id AND iv.source_job_id=parent.id)
  ) SELECT 1 FROM practice_owned_job source JOIN app.job root ON root.tenant_id=t AND root.id=source.id WHERE root.practice_session_digest=digest
 ) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;

CREATE OR REPLACE FUNCTION app.ch6_integrity_sources(t uuid,j uuid,d text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog STABLE AS $$
DECLARE ordinary jsonb; quotes jsonb; activations jsonb; activity jsonb; events jsonb; assertions jsonb;
 published jsonb:=NULL; publication jsonb; availability jsonb; start_at text; end_at text; now_at text; has_lock boolean; actor uuid;
BEGIN
 actor:=app.ch6_integrity_authority(t,j,d);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) INTO has_lock;
 -- Only exact, owned, immutable accepted documents and their saved party bindings. No fuzzy identity matching.
 -- Start with this job and exact party-related accepted jobs, then prove each
 -- candidate's ownership by walking its ancestors, never the whole session tree.
 WITH RECURSIVE candidates AS (
  SELECT jb.id FROM app.job jb WHERE jb.tenant_id=t AND (jb.id=j OR EXISTS(
   SELECT 1 FROM app.quote_document_version current_doc
   JOIN app.job current_job ON current_job.tenant_id=t AND current_job.id=j AND current_job.accepted_quote_version_id=current_doc.id
   JOIN app.job_party_binding current_binding ON current_binding.tenant_id=t AND current_binding.job_id=j AND current_binding.id::text=current_doc.snapshot->'jobParties'->>'bindingId'
   JOIN app.quote_document_version related_doc ON related_doc.tenant_id=t AND related_doc.job_id=jb.id AND related_doc.id=jb.accepted_quote_version_id
   JOIN app.job_party_binding related_binding ON related_binding.tenant_id=t AND related_binding.job_id=jb.id AND related_binding.id::text=related_doc.snapshot->'jobParties'->>'bindingId'
   WHERE current_doc.tenant_id=t AND current_doc.job_id=j AND related_binding.customer_id=current_binding.customer_id AND related_binding.site_id=current_binding.site_id
  ))
 ), ancestry AS (
  SELECT id AS candidate_id,id FROM candidates
  UNION SELECT source.candidate_id,parent.id FROM ancestry source
  JOIN app.job child ON child.tenant_id=t AND child.id=source.id AND child.provenance='imported' AND child.practice_session_digest IS NULL
  JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.subject_ref=child.id::text
  JOIN app.job parent ON parent.tenant_id=t AND parent.id::text=e.payload->'references'->>'sourceJobId' AND EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=child.id AND iv.source_job_id=parent.id)
 ), owned AS (
  SELECT DISTINCT source.candidate_id AS id FROM ancestry source JOIN app.job root ON root.tenant_id=t AND root.id=source.id AND root.practice_session_digest=d
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,a.job_id,d,a.id::text,'quote_acceptance',a.recorded_at,
 jsonb_build_object('document',doc.content_hash,'binding',b.id,'customer',b.customer_id,'site',b.site_id)),
 'status','accepted','customerId',coalesce(b.customer_id::text,'unbound'),'siteId',coalesce(b.site_id::text,'unbound'),'bindingConfirmed',b.id IS NOT NULL,
 'value',jsonb_build_object('pence',(doc.snapshot->>'netPence')::bigint,'currency','GBP','basis','net'),
 'acceptedAt',to_char(a.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY a.id),'[]') INTO quotes
 FROM app.quote_acceptance a JOIN owned o ON o.id=a.job_id JOIN app.job jb ON jb.tenant_id=t AND jb.id=a.job_id AND jb.accepted_quote_version_id=a.document_id
 JOIN app.quote_document_version doc ON(doc.tenant_id,doc.job_id,doc.id,doc.content_hash)=(a.tenant_id,a.job_id,a.document_id,a.document_hash)
 LEFT JOIN LATERAL (SELECT bind.* FROM app.job_party_binding bind WHERE bind.tenant_id=t AND bind.job_id=a.job_id AND bind.id::text=doc.snapshot->'jobParties'->>'bindingId' LIMIT 1) b ON true
 WHERE a.tenant_id=t AND jsonb_typeof(doc.snapshot->'netPence')='number' AND (doc.snapshot->>'netPence')~'^[0-9]+$'
 AND NOT EXISTS(SELECT 1 FROM app.acceptance_event cancelled WHERE cancelled.tenant_id=t AND cancelled.job_id=a.job_id AND (cancelled.acceptance_id=a.id OR (cancelled.kind='superseded' AND cancelled.document_id=a.document_id)) AND cancelled.kind IN('acceptance_cancelled','superseded') AND cancelled.recorded_at>=a.recorded_at);
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,a.id::text,'job_activation',a.recorded_at,jsonb_build_object('id',a.id,'document',a.accepted_document_hash))) ORDER BY a.id),'[]') INTO activations FROM app.job_activation a WHERE a.tenant_id=t AND a.job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,x.id::text,x.kind,x.created_at,x.content,x.provenance),'activityKind',x.activity) ORDER BY x.kind,x.id),'[]') INTO activity
 FROM (SELECT i.id,i.created_at,'customer_invoice'::text kind,'invoice'::text activity,jsonb_build_object('id',i.id,'source',i.source_hash,'pdf',i.pdf_sha256) content,'server_recorded'::text provenance FROM app.customer_invoice i WHERE i.tenant_id=t AND i.job_id=j
 UNION ALL SELECT p.id,p.created_at,'customer_payment','payment',jsonb_build_object('id',p.id,'invoice',p.invoice_id,'pence',p.amount_pence),'builder_attested' FROM app.customer_payment p WHERE p.tenant_id=t AND p.job_id=j) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,e.id::text,'job_work_state_event',e.fact_at,jsonb_build_object('id',e.id,'request',e.request_hash,'kind',e.kind,'predecessor',e.predecessor_id)),
 'kind',CASE e.kind WHEN 'finished_on_site' THEN 'finish' WHEN 'finished_cancelled' THEN 'cancel_finish' WHEN 'resumed' THEN 'resume' WHEN 'closed' THEN 'close' ELSE 'reopen' END,'predecessorId',e.predecessor_id::text) ORDER BY e.sequence),'[]') INTO events
 FROM app.job_work_state_event e WHERE e.tenant_id=t AND e.job_id=j AND e.kind IN('finished_on_site','finished_cancelled','resumed','closed','reopened');
 -- Minimized same-tenant, same-current-user equality only. No cross-tenant registry or raw user/phone/card value is returned.
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,encode(sha256(convert_to(d||':user','UTF8')),'hex'),'account_user_assertion',x.first_at,x.content),
 'identifierKind','user','scopeId',d,'subjectRef',encode(sha256(convert_to(d||':user','UTF8')),'hex'),'authorityRef','current-tenant-membership',
 'purpose','synthetic_integrity','validFrom',to_char(x.first_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'validUntil','9999-12-31T23:59:59.999999Z','sharing','unexplained')),'[]') INTO assertions
 FROM (SELECT min(m.created_at) first_at,jsonb_agg(jsonb_build_object('membership',m.id,'account',m.account_id) ORDER BY m.id) content
 FROM app.membership own JOIN app.membership m ON m.tenant_id=own.tenant_id AND m.identity_user_id=own.identity_user_id
 WHERE own.tenant_id=t AND own.id=actor AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 GROUP BY own.identity_user_id HAVING count(DISTINCT m.account_id)>1) x;
 SELECT assertions||coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,a.id::text,'synthetic_identifier_assertion',a.recorded_at,(to_jsonb(a)-'recorded_at'-'valid_from'-'valid_until')||jsonb_build_object('validFrom',to_char(a.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'validUntil',to_char(a.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
 'identifierKind',a.identifier_kind,'scopeId',d,'subjectRef',a.subject_ref,'authorityRef',a.authority_ref,'purpose','synthetic_integrity',
 'validFrom',to_char(a.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'validUntil',to_char(a.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sharing',a.sharing) ORDER BY a.id),'[]') INTO assertions
 FROM app.ch6_identifier_assertion a WHERE a.tenant_id=t AND a.job_id=j AND a.session_digest=d;
 ordinary:=jsonb_build_object('lockState',CASE WHEN has_lock THEN 'present' ELSE 'absent' END,'quotes',quotes,'activations',activations,'activity',activity,'workEvents',events,'assertions',assertions);
 availability:='["identifier_phone_source_unavailable","identifier_card_source_unavailable","writeoff_line_source_unavailable","receipt_line_source_handoff_unavailable"]'::jsonb;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(quotes) q WHERE NOT (q->>'bindingConfirmed')::boolean) THEN availability:=availability||'"quote_party_binding_unavailable"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM app.job q WHERE q.tenant_id=t AND q.practice_session_digest=d AND q.accepted_quote_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(quotes) fact WHERE fact->'source'->>'jobId'=q.id::text)) THEN availability:=availability||'"quote_value_source_unavailable"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='phone') THEN availability:=availability-'identifier_phone_source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='card') THEN availability:=availability-'identifier_card_source_unavailable'; END IF;
 -- This branch is the only publication entry. An unlocked call never reads or invokes hidden storage.
 IF has_lock THEN publication:=app.ch6_integrity_published(t,j,d);published:=nullif(publication->'published','null'::jsonb);availability:=availability||(publication->'availability');
 IF NOT (publication->'availability') ? 'writeoff_line_source_unavailable' THEN availability:=availability-'writeoff_line_source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='phone') THEN availability:=availability-'identifier_phone_source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='card') THEN availability:=availability-'identifier_card_source_unavailable'; END IF; END IF;
 SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') INTO start_at FROM app.job WHERE tenant_id=t AND id=j;
 WITH facts AS (SELECT f FROM jsonb_each(ordinary) a CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE '[]' END) f
 UNION ALL SELECT f FROM jsonb_each(coalesce(published,'{}')) a CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE '[]' END) f)
 SELECT least(start_at,coalesce(min(f->'source'->>'recordedAt'),start_at)),greatest(start_at,coalesce(max(f->'source'->>'recordedAt'),start_at),coalesce(published->>'cutoff',start_at)) INTO start_at,end_at FROM facts;
 SELECT coalesce(jsonb_agg(code ORDER BY code COLLATE "C"),'[]') INTO availability FROM (SELECT DISTINCT value code FROM jsonb_array_elements_text(availability)) codes;
 now_at:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 RETURN jsonb_build_object('input',jsonb_build_object('version','commercial-integrity-input.v3','environment','synthetic_demo','tenantId',t,'jobId',j,'scopeId',d,'evaluatedAt',now_at,
 'profile',jsonb_build_object('version','synthetic_fixture.persisted-v3.1','ruleVersion','persisted-v3.1','window',jsonb_build_object('start',start_at,'end',end_at),
 'won',jsonb_build_object('delayMicroseconds','604800000000'),'quote',jsonb_build_object('basis','net','endpoint','inclusive','windowDays',90),'restart',jsonb_build_object('minimumCycles',2),'allocation',jsonb_build_object('minimumPayments',2)),
 'phase',CASE WHEN published IS NULL OR published='null'::jsonb THEN 'pre_lock' ELSE 'post_lock' END,'ordinaryFacts',ordinary)
 ||CASE WHEN published IS NULL OR published='null'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('published',published) END,'availability',availability);
END $$;

CREATE OR REPLACE FUNCTION app.ch6_record_integrity_review(t uuid,j uuid,digest text,review jsonb,source_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;user_id uuid;cid uuid;rh text;sh text;answer jsonb;prior app.command_receipt;canonical_review jsonb;owned_jobs uuid[];
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
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'INTEGRITY_RETRY_REQUIRED' USING ERRCODE='40001'; END IF;
 -- Lock order: session, membership, command advisory, jobs (UUID order), then
 -- source rows in the order below, receipt, audit head. No later business locks.
 -- Related-quote facts also use owned jobs in this session, never another tenant.
 WITH RECURSIVE owned AS (SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
 UNION SELECT x.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
 JOIN app.job x ON x.tenant_id=t AND x.id::text=e.subject_ref AND x.provenance='imported' AND x.practice_session_digest IS NULL AND EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=x.id AND iv.source_job_id=source.id))
 SELECT array_agg(id ORDER BY id) INTO owned_jobs FROM owned;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_activation WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_activation_terms WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j ORDER BY job_id FOR SHARE;
 PERFORM 1 FROM app.customer_invoice WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.customer_payment WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.quote_acceptance WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.acceptance_event WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.quote_document_version WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_party_binding WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j ORDER BY run_id FOR SHARE;
 PERFORM 1 FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j ORDER BY run_id,signal_id FOR SHARE;
 PERFORM 1 FROM app.final_check_disposition_binding WHERE tenant_id=t AND job_id=j ORDER BY disposition_id FOR SHARE;
 PERFORM 1 FROM app.evidence_object WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.evidence_upload WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=j AND e.id=i.evidence_id) ORDER BY i.id FOR SHARE;
 PERFORM 1 FROM app.extra_origin WHERE tenant_id=t AND job_id=j ORDER BY variation_id FOR SHARE;
 PERFORM 1 FROM app.variation_revision WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_revision WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_line WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_invoiced_line WHERE tenant_id=t AND job_id=j ORDER BY invoice_id,final_account_line_id FOR SHARE;
 PERFORM 1 FROM app.final_account_invoice_binding WHERE tenant_id=t AND job_id=j ORDER BY invoice_id FOR SHARE;
 PERFORM 1 FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.customer_credit_note WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.ch6_identifier_assertion WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.ch6_line_correction_source WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 -- STABLE source readers/fingerprint use one fresh statement snapshot after
 -- these waits: absence predicates and all aggregates share that same snapshot.
 -- Row locks protect existing facts; they deliberately do not lock insert gaps.
 PERFORM app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
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

CREATE OR REPLACE FUNCTION app.decision_check_command(p_digest text,p_command jsonb,p_phase text,p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid; j uuid; c uuid; actor uuid; owned boolean; prior app.command_receipt;
 request_digest text; revision_number integer; item jsonb; did uuid; fid uuid; added integer:=0; repeated integer:=0;
 seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text; actor_ref text;
BEGIN
 -- Authority is established before job existence, phase handling or replay.
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF t IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=p_digest AND s.environment='synthetic_demo'
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(p_digest,t) a;
 IF actor IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor AND m.role='owner'
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR jsonb_typeof(p_command)<>'object' OR p_command->>'version' IS DISTINCT FROM 'finding-evaluation-command.v1'
   OR p_command - ARRAY['version','commandId','tenantId','jobId'] <> '{}'::jsonb
   OR (p_command->>'tenantId')::uuid IS DISTINCT FROM t OR p_command->>'commandId' IS NULL OR p_command->>'jobId' IS NULL
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 j:=(p_command->>'jobId')::uuid; c:=(p_command->>'commandId')::uuid;
 WITH RECURSIVE owned_job AS (
   SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=p_digest
   UNION
   SELECT next_job.id FROM owned_job source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job'
     AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job next_job ON next_job.tenant_id=e.tenant_id AND next_job.id::text=e.subject_ref
     AND next_job.provenance='imported' AND next_job.practice_session_digest IS NULL AND EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=next_job.id AND iv.source_job_id=source.id)
 ) SELECT EXISTS(SELECT 1 FROM owned_job WHERE id=j) INTO owned;
 IF NOT owned THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 -- Same lock order on all phases: authority -> job -> command -> receipt -> finding -> audit.
 -- This synthetic builder endpoint does not accept contractor principals or tenants.
 SELECT revision INTO revision_number FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('decision-check:'||t::text||':'||c::text,0));
 request_digest:=app.final_lock_hash(p_command);
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=c FOR UPDATE;
 IF FOUND AND (prior.command_type<>'finding.evaluate' OR prior.request_hash<>request_digest OR prior.actor_membership_id<>actor)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_phase='begin' THEN
   IF prior.command_id IS NOT NULL THEN
     IF prior.status<>'succeeded' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
     RETURN jsonb_build_object('replay',true,'response',prior.result);
   END IF;
   INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
     VALUES(c,t,'finding.evaluate','finding-evaluate:'||j::text||':'||c::text,request_digest,'processing',actor);
   RETURN jsonb_build_object('replay',false);
 END IF;
 IF prior.command_id IS NULL OR prior.status<>'processing' OR prior.created_at<>transaction_timestamp()
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_phase='persist' THEN
   IF p_data IS NULL OR jsonb_typeof(p_data->'findings') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_data->'suppressed') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'findings')>100
   THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_data->'findings') LOOP
     IF item->>'version' IS DISTINCT FROM 'finding.v1' OR (item->>'jobId')::uuid IS DISTINCT FROM j
       OR item - ARRAY['version','fingerprint','kind','classification','title','detail','jobId','subjectRef','actionType','suggestionConfidence'] <> '{}'::jsonb
       OR item->>'fingerprint' IS NULL OR item->>'fingerprint' !~ '^[a-f0-9]{64}$'
       OR (item->>'kind'='required_proof' AND item->>'classification' IS DISTINCT FROM 'mandatory')
     THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
     SELECT decision_id,id INTO did,fid FROM app.job_finding WHERE tenant_id=t AND fingerprint=item->>'fingerprint';
     IF FOUND THEN
       IF NOT EXISTS (SELECT 1 FROM app.job_finding f WHERE f.tenant_id=t AND f.id=fid AND f.job_id=j
         AND (f.kind,f.classification,f.title,f.detail,f.subject_ref,f.action_type)=
           (item->>'kind',item->>'classification',item->>'title',item->>'detail',item->>'subjectRef',item->>'actionType'))
       THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
       repeated:=repeated+1;
     ELSE
       did:=gen_random_uuid(); fid:=gen_random_uuid();
       INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
         VALUES(did,t,'finding',item->>'subjectRef',item->>'actionType');
       INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,suggestion_confidence,snapshot_revision)
         VALUES(fid,t,j,did,item->>'fingerprint',item->>'kind',item->>'classification',item->>'title',item->>'detail',item->>'subjectRef',item->>'actionType',(item->>'suggestionConfidence')::numeric,revision_number);
       added:=added+1;
     END IF;
     IF (p_data->'suppressed') ? (item->>'fingerprint') THEN
       INSERT INTO app.finding_suppression(id,tenant_id,finding_id,reason,policy_version)
         VALUES(gen_random_uuid(),t,fid,'daily_advisory_budget','decision-suppression.v1') ON CONFLICT(tenant_id,finding_id) DO NOTHING;
     END IF;
   END LOOP;
   RETURN jsonb_build_object('created',added,'replayed',repeated);
 ELSIF p_phase='finish' THEN
   IF p_data->'response' IS NULL OR p_data->'response'->>'version' IS DISTINCT FROM 'decision-inbox.v1'
   THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
   UPDATE app.command_receipt SET status='succeeded',result=p_data->'response',completed_at=clock_timestamp()
     WHERE tenant_id=t AND command_id=c;
   -- Audit allocation is the final new lock. All command/domain writes precede it.

     actor_ref:='membership:'||actor::text;
   payload:=jsonb_build_object('references',jsonb_build_object('commandId',c,'jobId',j));

   PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef',actor_ref,'eventType','finding.checked','subjectType','job','subjectRef',j::text,'payload',payload)),'checked_operation');

   RETURN '{}'::jsonb;
 END IF;
 RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
END $$;

COMMIT;
