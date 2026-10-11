BEGIN;
-- PRACTICE-FACTS-1 part A, issued 11 Oct 2026. Six extra synthetic facts:
-- the four part-A facts plus Ben's two F18 receipts (outside-VAT synthetic fixtures;
-- VAT treatment HELD). Supplier amounts are INTERIM synthetic fixtures, not product figures.
-- ALTER ONLY: no table/column/role/grant/policy/trigger/function is created or changed.
-- No existing row is updated, rewritten or deleted. Existing allowed values are all retained.
LOCK TABLE app.practice_feed_command, app.practice_feed_event, app.practice_feed_receipt_match IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE t text; names text[]; n text;
BEGIN
 FOREACH t IN ARRAY ARRAY['practice_feed_command','practice_feed_event','practice_feed_receipt_match'] LOOP
  SELECT array_agg(conname ORDER BY conname) INTO names
   FROM pg_constraint WHERE conrelid=format('app.%I',t)::regclass AND contype='c'
    AND position('receipt-384' in pg_get_constraintdef(oid))>0;
  IF cardinality(names) IS DISTINCT FROM 2 THEN
   RAISE EXCEPTION 'Expected exactly two catalogue CHECKs on app.%, found %',t,coalesce(cardinality(names),0);
  END IF;
  FOREACH n IN ARRAY names LOOP EXECUTE format('ALTER TABLE app.%I DROP CONSTRAINT %I',t,n); END LOOP;
 END LOOP;
END $$;
ALTER TABLE app.practice_feed_command
 ADD CONSTRAINT practice_feed_command_facts_v1_keys CHECK(movement_key IN('receipt-384','receipt-3000','receipt-41280','receipt-24000','receipt-17280','receipt-960','supplier-refund-540','receipt-12000','receipt-14640','supplier-payment-600','supplier-payment-840','receipt-interest-120','receipt-compensation-70')),
 ADD CONSTRAINT practice_feed_command_facts_v1_action CHECK(
  (action IN('connect','disconnect') AND movement_key IS NULL AND step IS NULL AND payment_id IS NULL) OR
  (action='advance' AND movement_key IS NOT NULL AND step IS NOT NULL AND payment_id IS NULL) OR
  (action='reconcile_duplicate' AND movement_key IS NOT NULL AND step IS NULL AND payment_id IS NULL) OR
  (action='match_receipt' AND movement_key IN('receipt-384','receipt-3000','receipt-41280','receipt-24000','receipt-17280','receipt-960','receipt-12000','receipt-14640','receipt-interest-120','receipt-compensation-70') AND step IS NULL AND payment_id IS NOT NULL)
 );
ALTER TABLE app.practice_feed_event
 ADD CONSTRAINT practice_feed_event_facts_v1_keys CHECK(movement_key IN('receipt-384','receipt-3000','receipt-41280','receipt-24000','receipt-17280','receipt-960','supplier-refund-540','receipt-12000','receipt-14640','supplier-payment-600','supplier-payment-840','receipt-interest-120','receipt-compensation-70')),
 ADD CONSTRAINT practice_feed_event_facts_v1_amount CHECK(gross_pence=CASE movement_key
  WHEN 'receipt-384' THEN 38400 WHEN 'receipt-3000' THEN 300000 WHEN 'receipt-41280' THEN 4128000
  WHEN 'receipt-24000' THEN 2400000 WHEN 'receipt-17280' THEN 1728000 WHEN 'receipt-960' THEN 96000
  WHEN 'supplier-refund-540' THEN 54000
  WHEN 'receipt-12000' THEN 1200000 WHEN 'receipt-14640' THEN 1464000
  WHEN 'supplier-payment-600' THEN 60000 WHEN 'supplier-payment-840' THEN 84000
  WHEN 'receipt-interest-120' THEN 12000 WHEN 'receipt-compensation-70' THEN 7000 END);
ALTER TABLE app.practice_feed_receipt_match
 ADD CONSTRAINT practice_feed_receipt_match_facts_v1_keys CHECK(movement_key IN('receipt-384','receipt-3000','receipt-41280','receipt-24000','receipt-17280','receipt-960','receipt-12000','receipt-14640','receipt-interest-120','receipt-compensation-70')),
 ADD CONSTRAINT practice_feed_receipt_match_facts_v1_amount CHECK(matched_pence=CASE movement_key
  WHEN 'receipt-384' THEN 38400 WHEN 'receipt-3000' THEN 300000 WHEN 'receipt-41280' THEN 4128000
  WHEN 'receipt-24000' THEN 2400000 WHEN 'receipt-17280' THEN 1728000 WHEN 'receipt-960' THEN 96000
  WHEN 'receipt-12000' THEN 1200000 WHEN 'receipt-14640' THEN 1464000
  WHEN 'receipt-interest-120' THEN 12000 WHEN 'receipt-compensation-70' THEN 7000 END);
COMMIT;
