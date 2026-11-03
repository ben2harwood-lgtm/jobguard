BEGIN;
-- M4-13: synthetic records must remain confined to the demo database.
CREATE OR REPLACE FUNCTION app.m413_command(t uuid,digest text,cmd uuid,v jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; prior app.command_receipt; latest app.subscription_mandate_event; request_hash text;
 result jsonb; kind text:=v->>'kind'; s jsonb; auth uuid; term_id uuid; expected integer; allowed text[];
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 -- Share subscription scheduling's lock; recheck membership/session after waiting.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon1_company_actor(t,digest);
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner'
 AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'MANDATE_FORBIDDEN'; END IF;
 allowed:=ARRAY['version','kind','expectedSequence'];
 IF kind='approve' THEN allowed:=allowed||ARRAY['termsText','termsHash']; END IF;
 IF cmd IS NULL OR v->>'version' IS DISTINCT FROM 'subscription-mandate-command.v1'
 OR kind IS NULL OR kind NOT IN('approve','revoked','cancelled','paused','renewal_failed','superseded')
 OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT(v ?& allowed) OR v-allowed<>'{}'::jsonb
 OR jsonb_typeof(v->'expectedSequence') IS DISTINCT FROM 'number' OR (v->>'expectedSequence') !~ '^[0-9]+$'
 THEN RAISE EXCEPTION 'MANDATE_INVALID'; END IF;
 request_hash:=app.final_lock_hash(jsonb_build_object('actor',actor,'command',v));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cmd;
 IF prior.command_id IS NOT NULL THEN
  IF prior.request_hash IS DISTINCT FROM request_hash OR prior.command_type IS DISTINCT FROM 'subscription.mandate.'||kind
  OR prior.actor_membership_id IS DISTINCT FROM actor OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'MANDATE_COMMAND_CONFLICT'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO latest FROM app.subscription_mandate_event WHERE tenant_id=t ORDER BY sequence DESC LIMIT 1;
 expected:=(v->>'expectedSequence')::integer;
 IF expected<>coalesce(latest.sequence,0) THEN RAISE EXCEPTION 'MANDATE_STALE'; END IF;
 IF kind='approve' THEN
  -- No approved notice policy exists. Every replacement, even after revocation, is held.
  IF latest.sequence IS NOT NULL THEN RAISE EXCEPTION 'MANDATE_NOTICE_REAUTHORISATION_REQUIRED'; END IF;
  s:=(v->>'termsText')::jsonb->'selection';
  allowed:=ARRAY['version','termsVersion','catalogueVersion','tenantId','agreementId','revision','plan','cadence','anchorDay','recipientRef','validFrom','expiresAt'];
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR NOT(s ?& allowed) OR s-allowed<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_each(s) field WHERE field.value='null'::jsonb)
  OR jsonb_typeof(s->'revision') IS DISTINCT FROM 'number' OR jsonb_typeof(s->'anchorDay') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'MANDATE_INVALID'; END IF;
  PERFORM (s->>'recipientRef')::uuid;
  IF s->>'tenantId' IS DISTINCT FROM t::text OR s->>'version' IS DISTINCT FROM 'subscription-agreement-selection.v1'
  OR s->>'revision' IS DISTINCT FROM '1' OR s->>'termsVersion' IS DISTINCT FROM 'synthetic_subscription_success_terms.v1'
  OR s->>'catalogueVersion' IS DISTINCT FROM 'subscription_pricing_policy_v4' OR s->>'cadence' IS DISTINCT FROM 'monthly'
  OR s->>'plan' IS NULL OR s->>'plan' NOT IN('Solo','Builder') OR (s->>'anchorDay')::integer NOT BETWEEN 1 AND 31
  OR (s->>'validFrom')::timestamptz<clock_timestamp() OR (s->>'expiresAt')::timestamptz<=(s->>'validFrom')::timestamptz
  THEN RAISE EXCEPTION 'MANDATE_INVALID'; END IF;
  term_id:=(s->>'agreementId')::uuid;
  INSERT INTO app.subscription_terms_version VALUES(t,term_id,1,s->>'termsVersion','synthetic_demo',s,v->>'termsText',v->>'termsHash');
  auth:=app.mon2_approve(t,actor,'subscription.mandate.approve',v->>'termsHash',1,NULL,term_id,(s->>'expiresAt')::timestamptz);
 ELSE
  IF latest.sequence IS NULL THEN RAISE EXCEPTION 'MANDATE_NOT_APPROVED'; END IF;
  IF latest.state IN('revoked','cancelled','superseded') AND NOT(kind='cancelled' AND latest.state='revoked') THEN RAISE EXCEPTION 'MANDATE_TERMINAL'; END IF;
  term_id:=latest.terms_id;
 END IF;
 result:=jsonb_build_object('version','subscription-mandate-result.v1','sequence',expected+1,'state',
 (CASE WHEN kind='approve' THEN 'active' ELSE kind END),'productionEnabled',false);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at)
 VALUES(t,cmd,'subscription.mandate.'||kind,cmd::text,request_hash,'succeeded',actor,result,clock_timestamp());
 INSERT INTO app.subscription_mandate_event VALUES(t,expected+1,term_id,result->>'state',actor,cmd,auth,clock_timestamp(),
 (CASE WHEN kind IN('revoked','cancelled') THEN 'pending' ELSE 'not_requested' END));
 -- Audit is last: no business locks acquired after allocation of the audit head.
 PERFORM app.mon2_audit(t,actor,cmd,'mandate.'||kind,request_hash,app.final_lock_hash(result));
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR not_null_violation OR check_violation THEN
 RAISE EXCEPTION 'MANDATE_INVALID' USING ERRCODE='22023';
END $$;
CREATE OR REPLACE FUNCTION app.m413_read(t uuid,digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e app.subscription_mandate_event; terms app.subscription_terms_version; approval app.subscription_mandate_event; decision uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 PERFORM app.mon1_company_actor(t,digest);
 SELECT * INTO e FROM app.subscription_mandate_event WHERE tenant_id=t ORDER BY sequence DESC LIMIT 1;
 IF e.sequence IS NULL THEN RETURN jsonb_build_object('record',NULL,'reason','NOT_APPROVED'); END IF;
 SELECT * INTO terms FROM app.subscription_terms_version WHERE tenant_id=t AND id=e.terms_id;
 SELECT * INTO approval FROM app.subscription_mandate_event WHERE tenant_id=t AND terms_id=e.terms_id AND state='active';
 SELECT decision_id INTO decision FROM app.action_authorization WHERE tenant_id=t AND id=approval.authorization_id;
 RETURN jsonb_build_object('now',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sequence',e.sequence,'providerCancellation',e.provider_cancellation,
 'authorityCurrent',app.mon2_authorized(t,approval.authorization_id,terms.revision),
 'record',jsonb_build_object('version','subscription-agreement-record.v1','environment','synthetic_demo','selection',terms.selection,
 'termsHash',terms.terms_hash,'state',e.state,'approval',jsonb_build_object('resolution','approved','actorMembershipId',approval.actor_membership_id,
 'decisionId',decision,'commandId',approval.command_id,'approvedAt',to_char(approval.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'termsHash',terms.terms_hash)));
END $$;
COMMIT;
