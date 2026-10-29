BEGIN;
-- DARK M4-2: only the synthetic database, no fee posting or external action.
CREATE TABLE app.recovery_billability_command (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, requester_membership_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('review','approve')), review_command_id uuid,
 payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,job_id,case_id,command_id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,requester_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id,review_command_id) REFERENCES app.recovery_billability_command(tenant_id,job_id,case_id,command_id),
 CHECK((action='review' AND review_command_id IS NULL AND actor_membership_id=requester_membership_id)
 OR (action='approve' AND review_command_id IS NOT NULL AND actor_membership_id<>requester_membership_id))
);
ALTER TABLE app.recovery_billability_command OWNER TO jobguard_migration;
ALTER TABLE app.recovery_billability_command ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recovery_billability_command FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.recovery_billability_command TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.recovery_billability_command FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
CREATE TRIGGER billability_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.recovery_billability_command
 FOR EACH STATEMENT EXECUTE FUNCTION app.recovery_attribution_immutable();

-- Private resolver reuses the real M4-8 allocation and D13 attribution owners.
CREATE FUNCTION app.billability_snapshot(t uuid,j uuid,c uuid,w uuid,l uuid,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE k uuid; d jsonb; rc app.recovery_case_current; subject jsonb; facts jsonb; n numeric; den numeric; available boolean;
BEGIN
 SELECT lock_id INTO k FROM app.stored_receipt_case_binding WHERE tenant_id=t AND job_id=j AND case_id=c AND work_id=w AND line_id=l;
 IF k IS NULL OR NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=k)
 THEN RAISE EXCEPTION 'BILLABILITY_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO rc FROM app.recovery_case_current WHERE tenant_id=t AND job_id=j AND id=c AND synthetic;
 IF rc.id IS NULL THEN RAISE EXCEPTION 'BILLABILITY_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 d:=app.recovery_attribution_sources(t,j,jsonb_build_object('caseId',c,'workId',w,'lineId',l,'lockId',k),actor);
 -- The source watermark is stable; assessment IDs/timestamps are deliberately not facts.
 d:=jsonb_set(d,'{facts,revisionId}',to_jsonb((substr(d->>'sourceHash',1,8)||'-'||substr(d->>'sourceHash',9,4)||'-4'||substr(d->>'sourceHash',14,3)||'-8'||substr(d->>'sourceHash',18,3)||'-'||substr(d->>'sourceHash',21,12))::uuid));
 n:=(d->'remainingPrincipal'->>'numerator')::numeric; den:=(d->'remainingPrincipal'->>'denominator')::numeric;
 available:=n>0 AND (d->'facts'->'facts'->'customer_payment_settled_and_allocated_to_that_line'->>'holds')::boolean;
 subject:=jsonb_build_object('tenantId',t,'jobId',j,'workId',w,'lineId',l);
 facts:=subject||jsonb_build_object('version','shadow-eligibility.v1','policyVersion','reference_recovery_eligibility_policy_v3','environment','synthetic_reference',
  'caseId',c,'approvedCase',d->>'assessmentOutcome'='eligible_for_review','unresolvedDispute',rc.state='negotiating',
  'category','missed_variation_final_account','principalNet',d->'remainingPrincipal','attribution',d->'facts',
  'proof',subject||jsonb_build_object('version','shadow-settlement-proof.v1','status',CASE WHEN available THEN 'verified_settled' ELSE 'unverified' END,'sourceRef',l),
  'origin',subject||jsonb_build_object('version','shadow-eligibility-origin.v1','kind','shadow_confirmed_extra','sourceRef',l));
 RETURN jsonb_build_object('version','recovery-billability-snapshot.v1','environment','synthetic_demo',
  'binding',jsonb_build_object('tenantId',t,'jobId',j,'caseId',c,'caseRevision',rc.revision,'evidenceRevision',rc.revision,
   'evidenceHash',d->>'sourceHash','policyVersion','reference_recovery_eligibility_policy_v3','policyRevision',1),
  'caseType',rc.case_type,'claimedNetPence',rc.claim_pence,'availableAllocatedNetPence',floor(n/den),
  'allocationState',CASE WHEN available THEN 'available' ELSE 'outcome_unknown' END,
  'evidenceComplete',(d->'facts'->'facts'->'evidence_received_before_lock'->>'holds')::boolean,
  'causationCertain',d->>'assessmentOutcome'='eligible_for_review' AND rc.state<>'negotiating','amountCertain',d->>'assessmentOutcome'='eligible_for_review',
  'taxBasisCertain',d->>'assessmentOutcome'='eligible_for_review',
  'builderCaptured',NOT (d->'facts'->'facts'->'absent_from_builder_captures_at_lock'->>'holds')::boolean,
  'disclosedBeforeLock',NOT (d->'facts'->'facts'->'not_disclosed_before_lock'->>'holds')::boolean,
  'finalAccountLockId',k,'sources',(SELECT jsonb_agg(jsonb_build_object('sourceId',s->>'sourceId','sourceVersion',s->>'sourceVersion','sourceHash',s->>'sourceHash')) FROM jsonb_array_elements(d->'sourceManifest') s),
  'facts',facts);
END $$;
ALTER FUNCTION app.billability_snapshot(uuid,uuid,uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.billability_snapshot(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;

-- Two calls in one repository transaction: prepare locked stored facts; save the
-- pure policy result. Saving independently repeats all checks; it trusts no JSON authority.
CREATE FUNCTION app.recovery_billability(j uuid,digest text,p jsonb,document jsonb DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a record; authority jsonb;
 c uuid; w uuid; l uuid; prior app.recovery_billability_command; reviewed app.recovery_billability_command;
 s jsonb; cmd jsonb; expected jsonb; requester uuid; principal numeric;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR NOT pg_has_role(session_user,'jobguard_runtime','USAGE')
 THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'recovery-billability-command.v1'
 OR p->>'action' NOT IN('review','approve') OR p->>'action' IS NULL
 OR p-ARRAY['version','action','commandId','caseId','workId','lineId','expectedCaseRevision','claimedEligiblePrincipalPence','reasons','reviewCommandId']<>'{}'::jsonb
 OR NOT(p ?& ARRAY['version','action','commandId','caseId','workId','lineId','expectedCaseRevision'])
 THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
 IF p->>'action'='review' THEN
  SELECT * INTO a FROM app.authenticate_practice_session(digest,t);
 ELSE
  SELECT m.tenant_id,m.id membership_id,m.identity_user_id INTO a FROM identity.session x JOIN app.membership m ON m.identity_user_id=x.user_id
  WHERE x.token_digest=digest AND x.environment='synthetic_demo' AND x.revoked_at IS NULL AND x.expires_at>clock_timestamp()
  AND m.tenant_id=t AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp());
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- No hidden source lookup until an authenticated owner has a locked practice job.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=a.membership_id AND m.identity_user_id=a.identity_user_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM app.job x JOIN app.final_account_lock k ON(k.tenant_id,k.job_id)=(x.tenant_id,x.id)
 WHERE x.tenant_id=t AND x.id=j AND x.practice_session_digest IS NOT NULL)
 THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p->>'action'='review' THEN PERFORM app.final_check_builder(t,j,digest); END IF;
 c:=(p->>'caseId')::uuid; w:=(p->>'workId')::uuid; l:=(p->>'lineId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c::text));
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||j::text,0));
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('billability:'||(p->>'commandId')));
 IF p->>'action'='review' THEN
  PERFORM 1 FROM control_plane.practice_session WHERE token_digest=digest FOR SHARE;
 ELSE
  PERFORM 1 FROM identity.session WHERE token_digest=digest FOR SHARE;
 END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a.membership_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=a.membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
 OR (p->>'action'='review' AND NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)))
 OR (p->>'action'='approve' AND NOT EXISTS(SELECT 1 FROM identity.session x WHERE x.token_digest=digest AND x.user_id=a.identity_user_id AND x.environment='synthetic_demo' AND x.revoked_at IS NULL AND x.expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM app.recovery_billability_command WHERE tenant_id=t AND command_id=(p->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.job_id<>j OR prior.actor_membership_id<>a.membership_id OR prior.payload<>p
  THEN RAISE EXCEPTION 'BILLABILITY_REPLAY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('replay',prior.result);
 END IF;
 s:=app.billability_snapshot(t,j,c,w,l,a.membership_id);
 IF (p->>'expectedCaseRevision')::integer IS DISTINCT FROM (s->'binding'->>'caseRevision')::integer
 THEN RAISE EXCEPTION 'BILLABILITY_STALE' USING ERRCODE='40001'; END IF;
 authority:=jsonb_build_object('environment','synthetic_demo','tenantId',t,'jobId',j,'membershipId',a.membership_id,'identityUserId',a.identity_user_id,'permission','review_recovery_eligibility');
 IF p->>'action'='review' THEN
  IF p ? 'reviewCommandId' OR NOT(p ?& ARRAY['claimedEligiblePrincipalPence','reasons'])
  OR jsonb_typeof(p->'reasons') IS DISTINCT FROM 'string' OR length(trim(p->>'reasons')) NOT BETWEEN 1 AND 2000
  OR coalesce(p->>'claimedEligiblePrincipalPence','') !~ '^(0|[1-9][0-9]*)$'
  THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
  IF (p->>'claimedEligiblePrincipalPence')::numeric>1000000000000 THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
  requester:=a.membership_id;
  cmd:=jsonb_build_object('version','recovery-billability-review-command.v1','commandId',p->'commandId','expected',s->'binding','claimedEligiblePrincipalPence',p->'claimedEligiblePrincipalPence','reasons',trim(p->>'reasons'));
 ELSE
  IF p ?| ARRAY['claimedEligiblePrincipalPence','reasons'] OR NOT(p ? 'reviewCommandId')
  THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
  SELECT * INTO reviewed FROM app.recovery_billability_command WHERE tenant_id=t AND job_id=j AND case_id=c AND command_id=(p->>'reviewCommandId')::uuid AND action='review';
  IF NOT FOUND OR reviewed.payload->>'workId' IS DISTINCT FROM w::text OR reviewed.payload->>'lineId' IS DISTINCT FROM l::text
  THEN RAISE EXCEPTION 'BILLABILITY_STALE' USING ERRCODE='23514'; END IF;
  requester:=reviewed.requester_membership_id;
  IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=requester AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
  THEN RAISE EXCEPTION 'BILLABILITY_STALE' USING ERRCODE='40001'; END IF;
  IF requester=a.membership_id THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='23514'; END IF;
  IF reviewed.result->'snapshot'<>s THEN RAISE EXCEPTION 'BILLABILITY_STALE' USING ERRCODE='40001'; END IF;
  principal:=(reviewed.result->'command'->>'claimedEligiblePrincipalPence')::numeric;
  IF reviewed.result->'assessment'->>'classification' IS DISTINCT FROM 'eligible_for_review'
  OR NOT (s->'causationCertain')::boolean OR (s->'builderCaptured')::boolean OR (s->'disclosedBeforeLock')::boolean
  OR s->>'allocationState'<>'available' OR principal<=0 OR principal>(s->>'claimedNetPence')::numeric
  OR principal>(s->>'availableAllocatedNetPence')::numeric
  THEN RAISE EXCEPTION 'BILLABILITY_NOT_APPROVABLE' USING ERRCODE='23514'; END IF;
  cmd:=jsonb_build_object('version','recovery-billability-approval-command.v1','commandId',p->'commandId','reviewCommandId',p->'reviewCommandId','expected',s->'binding');
 END IF;
 IF document IS NULL THEN RETURN jsonb_build_object('snapshot',s,'authority',authority,'command',cmd,'review',reviewed.result); END IF;
 IF p->>'action'='review' THEN
  expected:=jsonb_build_object('version','recovery-billability-review.v1','command',cmd,'snapshot',s,'reviewer',authority,'assessment',document->'assessment','productionEnabled',false);
  IF document->'assessment'->>'version' IS DISTINCT FROM 'recovery-billability-policy-result.v1'
  OR document->'assessment'->>'policyVersion' IS DISTINCT FROM 'reference_recovery_eligibility_policy_v3'
  OR document->'assessment'->'productionEnabled' IS DISTINCT FROM 'false'::jsonb
  OR document->'assessment'->>'classification' IS DISTINCT FROM (CASE WHEN (s->'causationCertain')::boolean
   AND (s->'facts'->'principalNet'->>'numerator')::numeric <= (s->>'availableAllocatedNetPence')::numeric * (s->'facts'->'principalNet'->>'denominator')::numeric
   THEN 'eligible_for_review' ELSE 'non_billable' END)
  THEN RAISE EXCEPTION 'BILLABILITY_NOT_APPROVABLE' USING ERRCODE='23514'; END IF;
 ELSE
  expected:=jsonb_build_object('version','recovery-billability-approval.v1','command',cmd,'review',reviewed.result,'approvedBy',authority,'productionEnabled',false);
 END IF;
 IF document IS DISTINCT FROM expected THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
 INSERT INTO app.recovery_billability_command(tenant_id,command_id,job_id,case_id,actor_membership_id,requester_membership_id,action,review_command_id,payload,result)
 VALUES(t,(p->>'commandId')::uuid,j,c,a.membership_id,requester,p->>'action',(p->>'reviewCommandId')::uuid,p,document);
 -- References only. Reasons and hidden attribution facts never enter audit.
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||a.membership_id::text,j,'recovery.billability.'||(p->>'action'),
 jsonb_build_object('commandId',p->>'commandId','caseId',c,'sourceHash',s->'binding'->>'evidenceHash'));
 RETURN jsonb_build_object('replay',document);
END $$;
ALTER FUNCTION app.recovery_billability(uuid,text,jsonb,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.recovery_billability(uuid,text,jsonb,jsonb) FROM PUBLIC,jobguard_shadow,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.recovery_billability(uuid,text,jsonb,jsonb) TO jobguard_runtime;
-- Enforce the reviewed source conditions at the allocation writer itself, even
-- when a future writer omits the existing proposal resolver. All writers use
-- the shared job allocator lock. No positive allocation can reopen spent line net.
CREATE FUNCTION app.guard_billability_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE fl app.receipt_allocation_fact_line; src app.receipt_allocation_fact_source; cap bigint; parts jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||NEW.tenant_id::text||':'||NEW.job_id::text,0));
 SELECT * INTO fl FROM app.receipt_allocation_fact_line WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.fact_line_id;
 SELECT * INTO src FROM app.receipt_allocation_fact_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=fl.source_id;
 IF fl.id IS NULL OR fl.line_id IS DISTINCT FROM NEW.line_id OR src.lock_id IS DISTINCT FROM NEW.lock_id
 OR NOT EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=NEW.tenant_id AND e.job_id=NEW.job_id AND e.id=src.movement_id AND trim(e.source_hash)=src.movement_hash)
 THEN RAISE EXCEPTION 'BILLABILITY_ALLOCATION_JOB_REQUIRED' USING ERRCODE='23514'; END IF;
 PERFORM app.receipt_fact_invoice_line(NEW.tenant_id,NEW.job_id,src.invoice_id,NEW.line_id,src.revision_id,NEW.lock_id,src.check_id);
 IF NOT EXISTS(SELECT 1 FROM app.stored_receipt_case_binding b WHERE (b.tenant_id,b.job_id,b.case_id,b.work_id,b.line_id,b.lock_id)=(NEW.tenant_id,NEW.job_id,NEW.case_id,NEW.work_id,NEW.line_id,NEW.lock_id))
 THEN RAISE EXCEPTION 'BILLABILITY_ALLOCATION_LINE_ALREADY_BOUND' USING ERRCODE='23514'; END IF;
 IF (NEW.net_numerator,NEW.net_denominator,NEW.gross_numerator,NEW.gross_denominator) IS DISTINCT FROM(fl.net_numerator,fl.net_denominator,fl.gross_numerator,fl.gross_denominator)
 THEN RAISE EXCEPTION 'BILLABILITY_ALLOCATION_AMOUNT_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NEW.reverses_id IS NULL THEN
  SELECT net_pence INTO cap FROM app.final_account_line WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.line_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n',a.net_numerator,'d',a.net_denominator)),'[]') INTO parts FROM app.stored_receipt_case_allocation a
   WHERE a.tenant_id=NEW.tenant_id AND a.job_id=NEW.job_id AND a.line_id=NEW.line_id AND a.reverses_id IS NULL;
  PERFORM app.assert_receipt_fact_bound(parts||jsonb_build_array(jsonb_build_object('n',NEW.net_numerator,'d',NEW.net_denominator)),cap,1);
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_billability_allocation() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_billability_allocation() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
CREATE TRIGGER billability_allocation_guard BEFORE INSERT ON app.stored_receipt_case_allocation FOR EACH ROW EXECUTE FUNCTION app.guard_billability_allocation();
COMMIT;
