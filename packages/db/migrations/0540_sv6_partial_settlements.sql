BEGIN;
-- Two distinct fictional GBP 480 gross movements; no fee or allocator changes.
-- Validate existing rows, preserve all previous catalogue and action checks.
LOCK TABLE app.practice_feed_command, app.practice_feed_event, app.practice_feed_receipt_match IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE t text; c record; replacement text; changed integer;
BEGIN
 FOREACH t IN ARRAY ARRAY['practice_feed_command','practice_feed_event','practice_feed_receipt_match'] LOOP
  changed := 0;
  FOR c IN SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint
   WHERE conrelid=format('app.%I',t)::regclass AND contype='c'
    AND position('receipt-960' in pg_get_constraintdef(oid))>0 LOOP
   IF position('CASE' in c.definition)>0 THEN
    replacement := replace(c.definition, 'WHEN ''receipt-960''::text THEN 96000',
     'WHEN ''receipt-960''::text THEN 96000 WHEN ''receipt-480-a''::text THEN 48000 WHEN ''receipt-480-b''::text THEN 48000');
   ELSE
    replacement := replace(c.definition, '''receipt-960''::text',
     '''receipt-960''::text, ''receipt-480-a''::text, ''receipt-480-b''::text');
   END IF;
   IF replacement=c.definition THEN RAISE EXCEPTION 'SV6 unexpected CHECK %.%',t,c.conname; END IF;
   EXECUTE format('ALTER TABLE app.%I DROP CONSTRAINT %I',t,c.conname);
   EXECUTE format('ALTER TABLE app.%I ADD CONSTRAINT %I %s',t,c.conname,replacement);
   changed := changed+1;
  END LOOP;
  IF changed<>2 THEN RAISE EXCEPTION 'SV6 expected two catalogue CHECKs on %, got %',t,changed; END IF;
 END LOOP;
END $$;
COMMIT;
