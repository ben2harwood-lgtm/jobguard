BEGIN;

-- Full reversals are immutable, tenant-qualified and unique. Existing duplicates
-- fail this migration; commercial history is never rewritten to make it install.
ALTER TABLE app.journal ADD CONSTRAINT journal_full_reversal_uq
  UNIQUE (tenant_id, reverses_journal_id);

-- Lock order: approving membership, obligation, original settlement (if any),
-- exact financial authorization, then the caller appends its audit batch last.
-- The original authorization identifies the approver; these historic synthetic
-- ports have no session parameter. No new grants or financial write paths.
CREATE OR REPLACE FUNCTION app.post_plan_obligation(
  j uuid,b uuid,r uuid,i uuid,n bigint,c char(3),s varchar,pk varchar,
  pr varchar,h char(64),a uuid,au uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
  PERFORM 1 FROM app.membership m JOIN app.financial_authorization x
    ON (m.tenant_id,m.id)=(x.tenant_id,x.membership_id)
    WHERE x.tenant_id=t AND x.id=a AND m.role IN ('owner','finance')
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    FOR SHARE OF m;
  IF NOT FOUND OR pk IS DISTINCT FROM 'synthetic_authorized_plan'
    OR n IS NULL OR n<=0 OR c IS DISTINCT FROM 'GBP' OR h IS NULL THEN
    RAISE EXCEPTION 'exact approved financial authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM app.assert_financial_authorization(t,a,'plan_obligation',n,c,h);
  IF r IS NOT DISTINCT FROM i OR NOT EXISTS (
    SELECT 1 FROM app.ledger_account WHERE tenant_id=t AND book_id=b AND id=r AND currency=c AND class='receivable'
  ) OR NOT EXISTS (
    SELECT 1 FROM app.ledger_account WHERE tenant_id=t AND book_id=b AND id=i AND currency=c AND class='deferred_income'
  ) THEN
    RAISE EXCEPTION 'distinct receivable and deferred income accounts in the same book required' USING ERRCODE='23514';
  END IF;
  INSERT INTO app.journal(id,tenant_id,book_id,currency,kind,source_event_id,provenance_kind,provenance_ref,artifact_hash,authorization_id,audit_event_id)
    VALUES(j,t,b,c,'plan_obligation',s,pk,pr,h,a,au);
  INSERT INTO app.journal_line(id,tenant_id,book_id,journal_id,account_id,currency,side,amount_pence)
    VALUES(gen_random_uuid(),t,b,j,r,c,'debit',n),(gen_random_uuid(),t,b,j,i,c,'credit',n);
  RETURN j;
END $$;

CREATE OR REPLACE FUNCTION app.post_plan_settlement(
  j uuid,b uuid,o uuid,cl uuid,r uuid,n bigint,c char(3),s varchar,
  pr varchar,h char(64),a uuid,au uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; outstanding numeric;
BEGIN
  PERFORM 1 FROM app.membership m JOIN app.financial_authorization x
    ON (m.tenant_id,m.id)=(x.tenant_id,x.membership_id)
    WHERE x.tenant_id=t AND x.id=a AND m.role IN ('owner','finance')
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    FOR SHARE OF m;
  IF NOT FOUND OR n IS NULL OR n<=0 OR c IS DISTINCT FROM 'GBP' OR h IS NULL THEN
    RAISE EXCEPTION 'exact approved financial authorization required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM app.journal WHERE tenant_id=t AND book_id=b AND id=o AND currency=c AND kind='plan_obligation' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'obligation not found' USING ERRCODE='P0002'; END IF;
  PERFORM app.assert_financial_authorization(t,a,'plan_settlement',n,c,h);
  IF cl IS NOT DISTINCT FROM r OR NOT EXISTS (
    SELECT 1 FROM app.ledger_account WHERE tenant_id=t AND book_id=b AND id=cl AND currency=c AND class='provider_clearing'
  ) OR NOT EXISTS (
    SELECT 1 FROM app.ledger_account WHERE tenant_id=t AND book_id=b AND id=r AND currency=c AND class='receivable'
  ) THEN
    RAISE EXCEPTION 'distinct clearing and receivable accounts in the same book required' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM app.journal WHERE tenant_id=t AND reverses_journal_id=o) THEN
    RAISE EXCEPTION 'settlement of a reversed obligation refused' USING ERRCODE='23514';
  END IF;
  -- Positive obligation minus credits of unreversed settlements. A full reversal
  -- offsets the original settlement, restoring that capacity exactly once.
  SELECT sum(amount_pence) INTO outstanding FROM app.journal_line
    WHERE tenant_id=t AND book_id=b AND journal_id=o AND account_id=r AND side='debit';
  outstanding:=outstanding-COALESCE((
    SELECT sum(l.amount_pence) FROM app.journal x JOIN app.journal_line l
      ON (l.tenant_id,l.book_id,l.journal_id)=(x.tenant_id,x.book_id,x.id)
      WHERE x.tenant_id=t AND x.book_id=b AND x.obligation_journal_id=o AND x.kind='plan_settlement'
        AND l.account_id=r AND l.side='credit'
        AND NOT EXISTS(SELECT 1 FROM app.journal reversal WHERE reversal.tenant_id=t AND reversal.reverses_journal_id=x.id)
  ),0);
  IF outstanding IS NULL OR n>outstanding THEN
    RAISE EXCEPTION 'settlement exceeds outstanding receivable' USING ERRCODE='23514';
  END IF;
  INSERT INTO app.journal(id,tenant_id,book_id,currency,kind,source_event_id,provenance_kind,provenance_ref,artifact_hash,authorization_id,audit_event_id,obligation_journal_id)
    VALUES(j,t,b,c,'plan_settlement',s,'authorized_settlement',pr,h,a,au,o);
  INSERT INTO app.journal_line(id,tenant_id,book_id,journal_id,account_id,currency,side,amount_pence)
    VALUES(gen_random_uuid(),t,b,j,cl,c,'debit',n),(gen_random_uuid(),t,b,j,r,c,'credit',n);
  RETURN j;
END $$;

CREATE OR REPLACE FUNCTION app.reverse_journal(
  j uuid,b uuid,o uuid,s varchar,pr varchar,h char(64),a uuid,au uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
  original app.journal; n bigint; c char(3);
BEGIN
  PERFORM 1 FROM app.membership m JOIN app.financial_authorization x
    ON (m.tenant_id,m.id)=(x.tenant_id,x.membership_id)
    WHERE x.tenant_id=t AND x.id=a AND m.role IN ('owner','finance')
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    FOR SHARE OF m;
  IF NOT FOUND OR h IS NULL THEN
    RAISE EXCEPTION 'exact approved financial authorization required' USING ERRCODE='42501';
  END IF;
  -- Read immutable metadata first so a settlement correction can lock its parent
  -- before the original, matching the settlement path and avoiding inverse locks.
  SELECT * INTO original FROM app.journal WHERE tenant_id=t AND book_id=b AND id=o;
  IF NOT FOUND THEN RAISE EXCEPTION 'original journal not found' USING ERRCODE='P0002'; END IF;
  IF original.kind='plan_settlement' THEN
    PERFORM 1 FROM app.journal WHERE tenant_id=t AND book_id=b AND id=original.obligation_journal_id FOR UPDATE;
  END IF;
  PERFORM 1 FROM app.journal WHERE tenant_id=t AND book_id=b AND id=o FOR UPDATE;
  SELECT sum(amount_pence) FILTER(WHERE side='debit'),currency INTO n,c
    FROM app.journal_line WHERE tenant_id=t AND book_id=b AND journal_id=o GROUP BY currency;
  IF n IS NULL THEN RAISE EXCEPTION 'original journal not found' USING ERRCODE='P0002'; END IF;
  PERFORM app.assert_financial_authorization(t,a,'correction',n,c,h);
  IF EXISTS(SELECT 1 FROM app.journal WHERE tenant_id=t AND reverses_journal_id=o) THEN
    RAISE EXCEPTION 'journal already fully reversed' USING ERRCODE='23505';
  END IF;
  IF original.kind='reversal' THEN
    RAISE EXCEPTION 'a full reversal cannot itself be reversed' USING ERRCODE='23514';
  END IF;
  IF original.kind='plan_obligation' AND EXISTS (
    SELECT 1 FROM app.journal settlement WHERE settlement.tenant_id=t
      AND settlement.obligation_journal_id=o AND settlement.kind='plan_settlement'
      AND NOT EXISTS(SELECT 1 FROM app.journal reversal WHERE reversal.tenant_id=t AND reversal.reverses_journal_id=settlement.id)
  ) THEN
    RAISE EXCEPTION 'reverse active settlements before the obligation' USING ERRCODE='23514';
  END IF;
  INSERT INTO app.journal(id,tenant_id,book_id,currency,kind,source_event_id,provenance_kind,provenance_ref,artifact_hash,authorization_id,audit_event_id,reverses_journal_id)
    VALUES(j,t,b,c,'reversal',s,'authorized_correction',pr,h,a,au,o);
  INSERT INTO app.journal_line(id,tenant_id,book_id,journal_id,account_id,currency,side,amount_pence)
    SELECT gen_random_uuid(),tenant_id,book_id,j,account_id,currency,
      CASE side WHEN 'debit' THEN 'credit' ELSE 'debit' END,amount_pence
      FROM app.journal_line WHERE tenant_id=t AND book_id=b AND journal_id=o;
  RETURN j;
END $$;

COMMIT;
