-- M4-12 RED: shared dark card / Direct Debit reservation persistence.
-- Forward fix only: never discard reservations, especially unknown provider outcomes.
BEGIN;
CREATE TABLE app.fee_reservation_book (
  tenant_id uuid PRIMARY KEY REFERENCES control_plane.tenant(id),
  book jsonb NOT NULL DEFAULT '{"version":"fee-reservation-book.v1","attempts":[],"events":{},"audit":[]}'::jsonb,
  CONSTRAINT fee_reservation_book_shape CHECK (
    jsonb_typeof(book) = 'object' AND book->>'version' = 'fee-reservation-book.v1'
    AND jsonb_typeof(book->'attempts') = 'array'
    AND jsonb_typeof(book->'events') = 'object'
    AND jsonb_typeof(book->'audit') = 'array'
    AND book ?& ARRAY['version','attempts','events','audit'])
);
ALTER TABLE app.fee_reservation_book OWNER TO jobguard_migration;
ALTER TABLE app.fee_reservation_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fee_reservation_book FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.fee_reservation_book FOR ALL TO jobguard_runtime
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.fee_reservation_book FROM PUBLIC, jobguard_infrastructure, jobguard_runtime;
GRANT SELECT, INSERT ON app.fee_reservation_book TO jobguard_runtime;
GRANT UPDATE(book) ON app.fee_reservation_book TO jobguard_runtime;
COMMIT;
