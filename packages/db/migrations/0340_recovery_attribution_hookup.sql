BEGIN;
-- SV-6: synthetic source-backed assessment only. Review and fee authority stay closed.
CREATE FUNCTION app.recovery_attribution_sources(t uuid,j uuid,p jsonb,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE c uuid:=(p->>'caseId')::uuid; w uuid:=(p->>'workId')::uuid;
 l uuid:=(p->>'lineId')::uuid; k uuid:=(p->>'lockId')::uuid;
 locked app.final_account_lock; item app.final_account_line; rc app.recovery_case_current;
 sig app.shadow_commercial_signal; origin app.extra_origin; proof app.final_check_reveal_proof;
 disposition app.final_check_disposition_binding; invoiced app.final_account_invoiced_line;
 binding app.final_account_invoice_binding; latest app.recovery_attribution_revision;
 allocation record; evidence jsonb; changes jsonb; saved jsonb; pair numeric[]; positive jsonb;
 n numeric; d numeric; paid boolean:=true; evidence_ok boolean; undisclosed boolean; confirmed boolean;
 sources jsonb:='[]'; manifests jsonb:='[]'; facts jsonb:='{}'; reasons jsonb:='[]'; exclusions jsonb;
 ids uuid[]; kinds text[]; predicates text[]; holds boolean[]; inventories jsonb[];
 source_hash text; subject jsonb; assessment uuid:=gen_random_uuid(); x integer; allocation_id uuid;
BEGIN
 SELECT * INTO locked FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=k;
 SELECT * INTO item FROM app.final_account_line WHERE tenant_id=t AND job_id=j AND id=l;
 SELECT * INTO rc FROM app.recovery_case_current WHERE tenant_id=t AND job_id=j AND id=c;
 SELECT o.* INTO origin FROM app.extra_origin o JOIN app.variation_revision vr
  ON(vr.tenant_id,vr.job_id,vr.variation_id)=(o.tenant_id,o.job_id,o.variation_id)
  WHERE vr.tenant_id=t AND vr.job_id=j AND vr.id=item.commercial_revision_id AND vr.id=item.source_id
   AND vr.scope_item_id=item.scope_item_id AND o.kind='jobguard_catch';
 SELECT * INTO sig FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j AND id=origin.source_signal_id;
 SELECT * INTO proof FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j AND signal_id=sig.id AND lock_id=k;
 SELECT * INTO disposition FROM app.final_check_disposition_binding WHERE tenant_id=t AND job_id=j AND signal_id=sig.id AND lock_id=k;
 SELECT * INTO invoiced FROM app.final_account_invoiced_line WHERE tenant_id=t AND job_id=j AND final_account_line_id=l;
 SELECT * INTO binding FROM app.final_account_invoice_binding WHERE tenant_id=t AND job_id=j AND invoice_id=invoiced.invoice_id;
 IF locked.id IS NULL OR item.id IS NULL OR rc.id IS NULL OR origin.variation_id IS NULL OR sig.id IS NULL
 OR proof.signal_id IS NULL OR disposition.disposition_id IS NULL OR invoiced.final_account_line_id IS NULL
 OR rc.case_type IS DISTINCT FROM 'missed_variation_final_account' OR NOT rc.synthetic OR rc.claim_revision IS NULL
 OR item.line_kind<>'variation' OR sig.work_id IS DISTINCT FROM w OR sig.coalesced_into_signal_id IS NOT NULL
 OR NOT rc.source_refs ? ('variation:'||origin.variation_id::text) OR NOT rc.source_refs ? ('revision:'||item.commercial_revision_id::text)
 OR binding.invoice_kind IS DISTINCT FROM 'supplementary' OR binding.lock_id IS DISTINCT FROM k
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 -- #368: the catch line must belong to the exact bound descendant of the locked
 -- revision, never an arbitrary same-job revision or a line on the original bill.
 PERFORM app.receipt_fact_invoice_line(t,j,invoiced.invoice_id,l,item.final_account_revision_id,k,binding.check_id);
 IF EXISTS(SELECT 1 FROM app.recovery_attribution_revision a WHERE a.tenant_id=t AND a.job_id=j
  AND (a.line_id=l OR a.work_id=w) AND (a.case_id,a.work_id,a.line_id,a.lock_id) IS DISTINCT FROM(c,w,l,k))
 OR NOT EXISTS(SELECT 1 FROM app.stored_receipt_case_binding b WHERE b.tenant_id=t AND b.job_id=j
  AND (b.case_id,b.work_id,b.line_id,b.lock_id)=(c,w,l,k))
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_LINE_ALREADY_BOUND' USING ERRCODE='23514'; END IF;
 SELECT * INTO latest FROM app.recovery_attribution_revision WHERE tenant_id=t AND job_id=j AND case_id=c AND work_id=w AND line_id=l AND lock_id=k ORDER BY revision DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.evidence_id),'[]') INTO evidence FROM app.shadow_signal_evidence e
  WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id;
 evidence_ok:=jsonb_array_length(evidence)>0 AND NOT EXISTS(
  SELECT 1 FROM app.shadow_signal_evidence e LEFT JOIN app.evidence_object o
   ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
  WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id AND (e.source_received_at>locked.locked_at OR o.id IS NULL
   OR o.server_verified_at IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id)));
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]') INTO changes FROM app.evidence_invalidation i
  WHERE i.tenant_id=t AND i.evidence_id IN(SELECT e.evidence_id FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id);
 undisclosed:=NOT sig.disclosed_before_lock AND NOT sig.must_surface_now AND sig.state<>'surfaced_early'
  AND NOT EXISTS(SELECT 1 FROM app.shadow_disclosure_event e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id AND e.before_lock);
 confirmed:=disposition.answer='confirmed_extra' AND sig.state='confirmed_extra' AND EXISTS(
  SELECT 1 FROM app.variation_approval a WHERE a.tenant_id=t AND a.job_id=j AND a.revision_id=item.commercial_revision_id AND a.signed_delta_pence>0);
 -- Allocation facts come only from M4-8-S; no second allocator or supplied money.
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'),
  coalesce(jsonb_agg(jsonb_build_object('n',a.net_numerator,'d',a.net_denominator)) FILTER(WHERE a.reverses_id IS NULL),'[]')
 INTO saved,positive FROM app.stored_receipt_case_allocation a
 WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.work_id=w AND a.line_id=l AND a.lock_id=k;
 -- #356: cap cumulative positive principal at line net; reversals do not reopen it.
 PERFORM app.assert_receipt_fact_bound(positive,item.net_pence,1);
 SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(a.net_numerator,a.net_denominator)),'[]')) INTO pair
 FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.work_id=w AND a.line_id=l AND a.lock_id=k;
 n:=greatest(pair[1],0);d:=pair[2];
 IF n>item.net_pence*d THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_LINE_CAP' USING ERRCODE='23514'; END IF;
 FOR allocation IN SELECT a.*,s.id source_id,s.payment_id,s.movement_id,s.movement_hash,s.invoice_id,s.revision_id,s.check_id,
  fl.line_id fact_line,fl.net_numerator fact_n,fl.net_denominator fact_d
  FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id)
  JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(fl.tenant_id,fl.job_id,fl.source_id)
  WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.work_id=w AND a.line_id=l AND a.lock_id=k ORDER BY a.id LOOP
  IF allocation.fact_line<>l OR allocation.invoice_id<>invoiced.invoice_id OR allocation.revision_id<>binding.revision_id
   OR (allocation.net_numerator,allocation.net_denominator) IS DISTINCT FROM(allocation.fact_n,allocation.fact_d)
   OR NOT app.receipt_fact_source_approved(t,j,allocation.source_id)
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  -- #346: the 0258 tenant FK alone does not bind a feed movement's job.
  IF NOT EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=t AND e.job_id=j AND e.id=allocation.movement_id AND trim(e.source_hash)=allocation.movement_hash AND e.state='settled' AND e.identity='identified')
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_MOVEMENT_JOB_REQUIRED' USING ERRCODE='23514'; END IF;
  IF allocation.reverses_id IS NULL THEN
   allocation_id:=coalesce(allocation_id,allocation.id);
   paid:=paid AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=t AND r.job_id=j AND r.payment_id=allocation.payment_id AND NOT EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.reverses_id=allocation.id))
    AND NOT EXISTS(SELECT 1 FROM app.customer_credit_note cn WHERE cn.tenant_id=t AND cn.job_id=j AND cn.invoice_id=allocation.invoice_id AND NOT EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(fl.tenant_id,fl.job_id,fl.source_id) WHERE a.tenant_id=t AND a.job_id=j AND a.reverses_id=allocation.id AND fs.source_manifest->>'creditNoteId'=cn.id::text))
    AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event e JOIN app.practice_feed_event original ON original.tenant_id=e.tenant_id AND original.account_id=e.account_id AND original.movement_key=e.movement_key
     WHERE original.tenant_id=t AND original.job_id=j AND original.id=allocation.movement_id AND e.state IN('reversed','possible_duplicate')
      AND (e.state='reversed' OR NOT EXISTS(SELECT 1 FROM app.practice_feed_command q WHERE q.tenant_id=t AND q.account_id=e.account_id AND q.movement_key=e.movement_key AND q.action='reconcile_duplicate')))
    AND NOT EXISTS(SELECT 1 FROM app.action_authorization a WHERE a.tenant_id=t AND a.id=allocation.authorization_id AND a.revoked_at IS NOT NULL);
   paid:=paid AND NOT EXISTS(SELECT 1 FROM app.action_authorization a JOIN app.receipt_allocation_fact_source fs ON fs.tenant_id=a.tenant_id AND fs.source_manifest->>'approvalRef'=a.id::text WHERE fs.tenant_id=t AND fs.job_id=j AND fs.id=allocation.source_id AND a.revoked_at IS NOT NULL);
  END IF;
 END LOOP;
 IF allocation_id IS NULL THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 -- A new immutable adjustment may be assessed before its allocation reversal is
 -- saved. Fail closed immediately, preserving the earlier revision as history.
 IF NOT paid THEN n:=0;d:=1; END IF;
 IF rc.state='prevented' THEN confirmed:=false; END IF;
 n:=least(n,greatest(rc.claim_pence-rc.written_off,0)*d);
 subject:=jsonb_build_object('tenantId',t,'jobId',j,'workId',w,'lineId',l,'lockId',k);
 ids:=ARRAY[(evidence->0->>'evidence_id')::uuid,sig.id,locked.baseline_quote_version_id,locked.command_id,locked.final_account_revision_id,proof.run_id,disposition.disposition_id,l,allocation_id];
 kinds:=ARRAY['evidence','disclosure','baseline_manifest','capture_manifest','locked_bill_manifest','reveal','disposition','invoice_line','line_allocation'];
 predicates:=ARRAY['evidence_received_before_lock','not_disclosed_before_lock','absent_from_accepted_scope','absent_from_builder_captures_at_lock','absent_from_locked_final_account','revealed_after_lock','builder_confirmed_genuine_extra_and_completed','billed_through_a_final_account_revision_and_invoice','customer_payment_settled_and_allocated_to_that_line','qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits'];
 holds:=ARRAY[evidence_ok,undisclosed,NOT coalesce(locked.snapshot->'baselineScopeItemIds' ? sig.matched_scope_item_id::text,false),
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(locked.snapshot->'captureRegister') e WHERE e->>'id'=sig.matched_variation_id::text),
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(locked.snapshot->'lines') e WHERE e->>'id'=l::text OR e->>'scopeItemId'=item.scope_item_id::text),
  proof.first_available_at>=locked.locked_at,confirmed,true,paid AND n>0,n>0];
 SELECT coalesce(jsonb_agg(jsonb_build_object('version','shadow-ineligibility.v1','reason',i.reason,'sourceRef',sig.id,'at',to_char(i.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'disclosureRoute',NULL) ORDER BY i.id),'[]') INTO exclusions
 FROM app.shadow_signal_ineligibility i WHERE i.tenant_id=t AND i.job_id=j AND i.signal_id=sig.id;
 -- Hash all source facts, not just their IDs. Unallocated credits/refunds and
 -- invalidation also change the watermark, even before the neutral producer runs.
 source_hash:=app.final_lock_hash(jsonb_build_object('lock',locked.snapshot_digest,'signal',to_jsonb(sig),'proof',to_jsonb(proof),'disposition',to_jsonb(disposition),
  'allocations',saved,'invalidation',changes,'holds',holds,'exclusions',exclusions,'remaining',jsonb_build_array(n,d),'caseRevision',rc.revision));
 FOR x IN 1..9 LOOP
  sources:=sources||jsonb_build_array(jsonb_build_object('kind',kinds[x],'sourceId',ids[x],'sourceVersion',source_hash,'sourceHash',source_hash,'tenantId',t,'jobId',j));
 END LOOP;
 FOR allocation IN SELECT a.id,a.reverses_id FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.work_id=w AND a.line_id=l AND a.lock_id=k AND a.id<>allocation_id LOOP
  sources:=sources||jsonb_build_array(jsonb_build_object('kind',CASE WHEN allocation.reverses_id IS NULL THEN 'line_allocation' ELSE 'line_reversal' END,'sourceId',allocation.id,'sourceVersion',source_hash,'sourceHash',source_hash,'tenantId',t,'jobId',j));
 END LOOP;
 inventories:=ARRAY[coalesce(locked.snapshot->'baselineScopeItemIds','[]'),proof.comparisons->'captureIds',proof.comparisons->'lockedLineIds'];
 FOR x IN 3..5 LOOP
  manifests:=manifests||jsonb_build_array(jsonb_build_object('kind',kinds[x],'sourceId',ids[x],'lockId',k,'status','completed','itemIds',inventories[x-2],'itemCount',jsonb_array_length(inventories[x-2])));
 END LOOP;
 FOR x IN 1..10 LOOP
  facts:=facts||jsonb_build_object(predicates[x],subject||jsonb_build_object('version','shadow-fact.v1','predicate',predicates[x],'holds',holds[x],'sourceRef',ids[least(x,9)]));
  IF NOT holds[x] THEN reasons:=reasons||to_jsonb(predicates[x]); END IF;
 END LOOP;
 IF jsonb_array_length(exclusions)>0 THEN reasons:=reasons||'"permanent_or_disputed_exclusion"'::jsonb; END IF;
 RETURN subject||jsonb_build_object('version','recovery-attribution-revision.v1','caseId',c,'assessmentId',assessment,'revision',coalesce(latest.revision,0)+1,'previousAssessmentId',latest.id,
  'caseRevision',rc.revision,'sourceRevision',source_hash,'sourceHash',source_hash,'sourceManifest',sources,'completeManifests',manifests,
  'facts',subject||jsonb_build_object('version','shadow-attribution.v1','policyVersion','shadow_attribution_policy_v3','revisionId',assessment,'disputeReview',NULL,'exclusions',exclusions,'facts',facts),
  'remainingPrincipal',jsonb_build_object('numerator',trunc(n)::text,'denominator',trunc(d)::text),'assessmentOutcome',CASE WHEN reasons='[]'::jsonb THEN 'eligible_for_review' ELSE 'excluded' END,'reasonCodes',reasons,
  'attributionPolicyVersion','shadow_attribution_policy_v3','eligibilityPolicyVersion','reference_recovery_eligibility_policy_v3','policyBundleRef','recovery-fee-illustration.synthetic-policy.v1',
  'assessedBy',jsonb_build_object('kind','membership','actorRef',actor),'serverRecordedAt',to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'environment','synthetic_demo','productionEnabled',false,'realExternalActions',0);
END $$;
ALTER FUNCTION app.recovery_attribution_sources(uuid,uuid,jsonb,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.recovery_attribution_sources(uuid,uuid,jsonb,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow;

CREATE OR REPLACE FUNCTION app.assess_recovery_attribution(p_job uuid,p_session text,p_command jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor record;
 c uuid; prior app.recovery_attribution_command; document jsonb; result jsonb; previous uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Malformed session digests and unversioned/authority-bearing payloads stay closed.
 -- This gate reads no job/hidden data and never substitutes caller facts for stored sources.
 IF p_session IS NULL OR p_session !~ '^[0-9a-f]{64}$'
 OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
 OR p_command->>'version' IS DISTINCT FROM 'recovery-attribution-command.v1'
 OR p_command-ARRAY['version','action','commandId','caseId','workId','lineId','lockId','expectedCaseRevision','expectedAttributionRevision']<>'{}'::jsonb
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 -- Scope/owner/lock before any hidden source, subject lookup or replay.
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session);
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=p_job AND practice_session_digest=p_session)
 OR NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=p_job)
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_command->>'action'='approve_review' THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'version' IS DISTINCT FROM 'recovery-attribution-command.v1'
 OR p_command->>'action' IS DISTINCT FROM 'assess'
 OR p_command-ARRAY['version','action','commandId','caseId','workId','lineId','lockId','expectedCaseRevision','expectedAttributionRevision']<>'{}'::jsonb
 OR NOT(p_command ?& ARRAY['version','action','commandId','caseId','workId','lineId','lockId','expectedCaseRevision','expectedAttributionRevision'])
 OR coalesce(p_command->>'expectedCaseRevision','') !~ '^[1-9][0-9]*$' OR coalesce(p_command->>'expectedAttributionRevision','') !~ '^(0|[1-9][0-9]*)$'
 THEN RAISE EXCEPTION 'INVALID_RECOVERY_ATTRIBUTION_COMMAND' USING ERRCODE='23514'; END IF;
 c:=(p_command->>'caseId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c::text));
 -- Shared with the allocator, then append's command lock, before any audit.
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||p_job::text,0));
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session,true);
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('attribution-command:'||(p_command->>'commandId')));
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session);
 SELECT * INTO prior FROM app.recovery_attribution_command WHERE tenant_id=t AND command_id=(p_command->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.job_id<>p_job OR prior.actor_membership_id<>actor.member_id OR prior.payload<>p_command
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.first_result;
 END IF;
 document:=app.recovery_attribution_sources(t,p_job,p_command,actor.member_id);
 previous:=(document->>'previousAssessmentId')::uuid;
 result:=app.append_recovery_attribution(document,actor.member_id,p_command,CASE WHEN previous IS NOT NULL THEN 'source_changed' END,CASE WHEN previous IS NOT NULL THEN document->>'sourceHash' END);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'recovery.attribution_assessed',
  jsonb_build_object('commandId',p_command->>'commandId','assessmentId',document->>'assessmentId','caseId',c,'sourceHash',document->>'sourceHash'));
 RETURN result;
END $$;
COMMIT;
