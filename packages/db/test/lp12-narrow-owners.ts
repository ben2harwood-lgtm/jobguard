export const lp12Owners = ["jobguard_binding_owner", "jobguard_binding_lookup_owner",
  "jobguard_command_writer", "jobguard_audit_writer", "jobguard_money_owner"] as const;
export const lp12Moved = [
  ["app.lp6_session_authority(text,text,uuid)", "jobguard_binding_lookup_owner"],
  ["app.assert_financial_authorization(uuid,uuid,varchar,bigint,character,character)", "jobguard_money_owner"],
  ["app.post_plan_obligation(uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,varchar,character,uuid,uuid)", "jobguard_money_owner"],
  ["app.post_plan_settlement(uuid,uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,character,uuid,uuid)", "jobguard_money_owner"],
  ["app.reverse_journal(uuid,uuid,uuid,varchar,varchar,character,uuid,uuid)", "jobguard_money_owner"],
] as const;
export const lp12TableGrants = {
  jobguard_binding_lookup_owner: [
    "app.contractor_membership_revocation:SELECT", "app.membership:SELECT",
    "control_plane.contractor_practice_session:SELECT", "control_plane.practice_session:SELECT", "identity.session:SELECT",
  ],
  jobguard_money_owner: ["app.financial_authorization:SELECT", "app.journal:INSERT", "app.journal:SELECT",
    "app.journal_line:INSERT", "app.journal_line:SELECT", "app.ledger_account:SELECT", "app.membership:SELECT"],
} as const;
export const lp12ColumnGrants = {
  jobguard_binding_lookup_owner: ["control_plane.contractor_practice_session.session_id:UPDATE",
    "control_plane.practice_session.token_digest:UPDATE", "identity.session.id:UPDATE"],
  jobguard_money_owner: ["app.financial_authorization.id:UPDATE", "app.journal.id:UPDATE", "app.membership.id:UPDATE"],
} as const;
