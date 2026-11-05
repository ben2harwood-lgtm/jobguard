BEGIN;
CREATE FUNCTION app.merchant_delivery_record_read(t uuid,digest text,j uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MERCHANT_RECORD_DARK'; END IF;
 PERFORM app.mon1_company_actor(t,digest);
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j) THEN
  RAISE EXCEPTION 'MERCHANT_RECORD_UNAVAILABLE';
 END IF;
 RETURN (WITH latest AS (
  SELECT DISTINCT ON (g.order_draft_id) g.* FROM app.goods_receipt g
  WHERE g.tenant_id=t ORDER BY g.order_draft_id,g.revision DESC
 ) SELECT coalesce(jsonb_agg(jsonb_build_object(
  'version','merchant-delivery-receipt.v1','tenantId',g.tenant_id,'jobId',g.job_id,
  'orderId',g.order_draft_id,'revision',g.revision,'supplierContext',d.supplier_context,'status',d.status,
  'ordered',g.ordered_quantity::text,'delivered',g.delivered_quantity::text,
  'accepted',g.accepted_quantity::text,'rejected',g.rejected_quantity::text,'missing',g.missing_quantity::text,
  'firstDelivered',f.delivered_quantity::text,'firstMissing',f.missing_quantity::text
 ) ORDER BY g.order_draft_id),'[]'::jsonb)
 FROM latest g JOIN app.supplier_document d ON (d.tenant_id,d.job_id,d.id)=(g.tenant_id,g.job_id,g.document_id)
 JOIN LATERAL (SELECT r.delivered_quantity,r.missing_quantity FROM app.goods_receipt r
  JOIN app.supplier_document s ON (s.tenant_id,s.job_id,s.id)=(r.tenant_id,r.job_id,r.document_id)
  WHERE (r.tenant_id,r.order_draft_id)=(g.tenant_id,g.order_draft_id) AND s.status='ready'
  ORDER BY r.revision LIMIT 1) f ON true);
END $$;
ALTER FUNCTION app.merchant_delivery_record_read(uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.merchant_delivery_record_read(uuid,text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.merchant_delivery_record_read(uuid,text,uuid) TO jobguard_runtime;
COMMIT;
