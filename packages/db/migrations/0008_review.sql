BEGIN;

-- A review is a mutable, optimistic-concurrency-controlled projection of an immutable proposal.
CREATE TABLE app.proposal_review (
  id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, proposal_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0), state varchar(12) NOT NULL DEFAULT 'reviewing'
    CHECK (state IN ('reviewing','confirmed')),
  confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,proposal_id), UNIQUE (tenant_id,job_id,id),
  FOREIGN KEY (tenant_id,job_id,proposal_id) REFERENCES app.job_record_proposal(tenant_id,job_id,id),
  CHECK ((state='confirmed') = (confirmed_at IS NOT NULL))
);
CREATE TABLE app.proposal_review_line (
  id uuid NOT NULL, tenant_id uuid NOT NULL, review_id uuid NOT NULL, job_id uuid NOT NULL,
  scope_item_id uuid NOT NULL, origin varchar(10) NOT NULL CHECK (origin IN ('proposal','human')),
  description varchar(500) NOT NULL, room varchar(100) NOT NULL, category varchar(100) NOT NULL,
  quantity_decimal varchar(40), unit varchar(40), unit_price_pence bigint CHECK (unit_price_pence >= 0),
  disposition varchar(12) NOT NULL CHECK (disposition IN ('proposed','accepted','dismissed','split','merged')),
  dismissal_reason varchar(200), source_excerpt varchar(1000), ordinal integer NOT NULL CHECK (ordinal > 0),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,review_id,id), UNIQUE (tenant_id,review_id,scope_item_id),
  FOREIGN KEY (tenant_id,job_id,review_id) REFERENCES app.proposal_review(tenant_id,job_id,id),
  FOREIGN KEY (tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
  CHECK ((disposition='dismissed') = (dismissal_reason IS NOT NULL)),
  CHECK (origin <> 'human' OR source_excerpt IS NULL)
);
CREATE TABLE app.proposal_review_line_parent (
  tenant_id uuid NOT NULL, job_id uuid NOT NULL, review_id uuid NOT NULL, line_id uuid NOT NULL, parent_scope_item_id uuid NOT NULL,
  PRIMARY KEY (tenant_id,line_id,parent_scope_item_id),
  FOREIGN KEY (tenant_id,review_id,line_id) REFERENCES app.proposal_review_line(tenant_id,review_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,job_id,parent_scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id)
);
CREATE TABLE app.proposal_review_question (
  id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, review_id uuid NOT NULL,
  question varchar(500) NOT NULL, blocking boolean NOT NULL,
  disposition varchar(20) NOT NULL CHECK (disposition IN ('unresolved','answered','carry_to_quote')), answer varchar(500),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,review_id,id),
  FOREIGN KEY (tenant_id,job_id,review_id) REFERENCES app.proposal_review(tenant_id,job_id,id),
  CHECK ((disposition='answered') = (answer IS NOT NULL))
);

-- Canonical scope may retain unknown price until M1-4 quote pricing; quote issue must reject it.
ALTER TABLE app.scope_revision ALTER COLUMN unit_price_pence DROP NOT NULL;
ALTER TABLE app.scope_revision ALTER COLUMN total_pence DROP NOT NULL;

DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['proposal_review','proposal_review_line','proposal_review_line_parent','proposal_review_question'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n); EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;
COMMIT;
