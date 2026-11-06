BEGIN;
-- LATER-SAFETY-1: read, approve, standing authority and dispatch share the review rule.
CREATE OR REPLACE FUNCTION app.payment_fee_current(t uuid,j uuid,s uuid,actor uuid) RETURNS text
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE st app.payment_fee_statement; p record; approval app.action_authorization;
BEGIN
 SELECT * INTO st FROM app.payment_fee_statement WHERE tenant_id=t AND job_id=j AND id=s;
 IF st.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_FEE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM app.payment_fee_command c WHERE c.tenant_id=t AND c.job_id=j AND c.statement_id=s AND c.payload->>'action'='dispute') THEN RETURN 'disputed'; END IF;
 BEGIN
  IF app.payment_fee_receipt_sources(t,j,st.payment_id,actor) IS DISTINCT FROM st.sources THEN RETURN 'source_changed'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(st.prior_statements) LOOP
   IF NOT EXISTS(SELECT 1 FROM app.payment_fee_statement previous WHERE previous.tenant_id=t AND previous.job_id=j
    AND previous.id=(p.value->>'statementId')::uuid
    AND previous.sources=app.payment_fee_receipt_sources(t,j,previous.payment_id,actor))
   OR EXISTS(SELECT 1 FROM app.payment_fee_command c WHERE c.tenant_id=t AND c.job_id=j AND c.statement_id=(p.value->>'statementId')::uuid AND c.payload->>'action'='dispute')
   THEN RETURN 'source_changed'; END IF;
  END LOOP;
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM='PAYMENT_FEE_PAUSED' THEN RETURN 'disputed'; END IF;
  RETURN 'source_changed';
 END;
 SELECT a.* INTO approval FROM app.payment_fee_command c JOIN app.action_authorization a ON(a.tenant_id,a.id)=(c.tenant_id,c.authorization_id)
  WHERE c.tenant_id=t AND c.job_id=j AND c.statement_id=s;
 IF approval.id IS NULL THEN RETURN 'awaiting_approval'; END IF;
 IF approval.revoked_at IS NOT NULL THEN RETURN 'approval_revoked'; END IF;
 IF approval.expires_at<=clock_timestamp() THEN RETURN 'approval_expired'; END IF;
 BEGIN
  PERFORM app.payment_fee_review_deadline(t,j,st.sources,actor);
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM='PAYMENT_FEE_REVIEW_REQUIRED' THEN RETURN 'source_changed'; END IF;
  RAISE;
 END;
 RETURN 'approved';
END $$;
COMMIT;
