-- LATER-SAFETY-84: a prior combined final may bind a lock descendant.
-- Preserve the private invoker helper, owner and ACL; no rows or grants change.
-- Forward fix: replace only this predicate; the predecessor body fails closed.
BEGIN;

CREATE OR REPLACE FUNCTION app.receipt_fact_invoice_line(t uuid,j uuid,i uuid,l uuid,r uuid,k uuid,ch uuid) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE binding app.final_account_invoice_binding; locked app.final_account_lock; item app.final_account_line;
BEGIN
 SELECT * INTO binding FROM app.final_account_invoice_binding WHERE tenant_id=t AND job_id=j AND invoice_id=i;
 SELECT * INTO locked FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=k;
 SELECT * INTO item FROM app.final_account_line WHERE tenant_id=t AND job_id=j AND id=l AND final_account_revision_id=r;
 IF item.id IS NULL OR locked.id IS NULL OR binding.invoice_id IS NULL
 OR (binding.revision_id,binding.lock_id,binding.check_id) IS DISTINCT FROM(r,k,ch)
 OR NOT EXISTS(SELECT 1 FROM app.final_account_invoiced_line x WHERE x.tenant_id=t AND x.job_id=j AND x.invoice_id=i AND x.final_account_line_id=l AND x.revision_id=r
  AND (x.scope_item_id,x.commercial_revision_id,x.line_kind,x.source_id,x.net_pence)=(item.scope_item_id,item.commercial_revision_id,item.line_kind,item.source_id,item.net_pence))
 OR NOT EXISTS(SELECT 1 FROM app.final_account_lock_check x WHERE x.tenant_id=t AND x.job_id=j AND x.lock_id=k AND x.id=ch AND x.status='completed')
 THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 IF binding.invoice_kind='final' THEN
  IF r<>locked.final_account_revision_id THEN
   -- Historical invoices remain valid after later draft revisions. The immutable
   -- issued revision was checked at issue; recheck its source with that revision.
   PERFORM app.j3_require_combined_revision(t,j,r,k);
  END IF;
 ELSIF binding.invoice_kind='supplementary' THEN
  IF r=locked.final_account_revision_id OR NOT EXISTS(
   WITH RECURSIVE ancestors AS (
    SELECT x.id,x.previous_revision_id,x.revision,ARRAY[x.id] path FROM app.final_account_revision x
     WHERE x.tenant_id=t AND x.job_id=j AND x.id=r AND x.baseline_quote_version_id=locked.baseline_quote_version_id
    UNION ALL SELECT x.id,x.previous_revision_id,x.revision,a.path||x.id FROM app.final_account_revision x JOIN ancestors a ON x.id=a.previous_revision_id
     WHERE x.tenant_id=t AND x.job_id=j AND x.baseline_quote_version_id=locked.baseline_quote_version_id AND x.revision<a.revision AND NOT x.id=ANY(a.path)
   ) SELECT 1 FROM ancestors WHERE id=locked.final_account_revision_id)
  OR NOT EXISTS(
   WITH RECURSIVE ancestors AS (
    SELECT x.id,x.previous_revision_id,x.revision,ARRAY[x.id] path FROM app.final_account_revision x
     WHERE x.tenant_id=t AND x.job_id=j AND x.id=r AND x.baseline_quote_version_id=locked.baseline_quote_version_id
    UNION ALL SELECT x.id,x.previous_revision_id,x.revision,a.path||x.id FROM app.final_account_revision x JOIN ancestors a ON x.id=a.previous_revision_id
     WHERE x.tenant_id=t AND x.job_id=j AND x.baseline_quote_version_id=locked.baseline_quote_version_id AND x.revision<a.revision AND NOT x.id=ANY(a.path)
   ) SELECT 1 FROM app.final_account_invoice_binding x
    JOIN ancestors issued ON issued.id=x.revision_id
    JOIN ancestors original ON original.id=locked.final_account_revision_id AND original.revision<=issued.revision
    WHERE x.tenant_id=t AND x.job_id=j AND x.lock_id=k AND x.invoice_kind='final')
  OR EXISTS(SELECT 1 FROM app.final_account_line x WHERE x.tenant_id=t AND x.job_id=j AND x.final_account_revision_id=locked.final_account_revision_id
   AND (x.id=l OR (x.line_kind,x.source_id,x.commercial_revision_id,x.scope_item_id)=(item.line_kind,item.source_id,item.commercial_revision_id,item.scope_item_id)))
  THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
END $$;

COMMIT;
