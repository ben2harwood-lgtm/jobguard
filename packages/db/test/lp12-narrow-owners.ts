export const lp12Owners = ["jobguard_binding_owner", "jobguard_session_lookup",
  "jobguard_command_writer", "jobguard_audit_writer", "jobguard_money_owner"] as const;
export const lp12CredentialLookup = ["app.lp6_session_authority(text,text,uuid)", "jobguard_session_lookup"] as const;
export const lp12Moved = [
  ["app.assert_financial_authorization(uuid,uuid,varchar,bigint,character,character)", "jobguard_money_owner"],
  ["app.post_plan_obligation(uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,varchar,character,uuid,uuid)", "jobguard_money_owner"],
  ["app.post_plan_settlement(uuid,uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,character,uuid,uuid)", "jobguard_money_owner"],
  ["app.reverse_journal(uuid,uuid,uuid,varchar,varchar,character,uuid,uuid)", "jobguard_money_owner"],
] as const;
export const lp12TableGrants = {
  jobguard_money_owner: ["app.financial_authorization:SELECT", "app.journal:INSERT", "app.journal:SELECT",
    "app.journal_line:INSERT", "app.journal_line:SELECT", "app.ledger_account:SELECT", "app.membership:SELECT"],
} as const;
export const lp12ColumnGrants = {
  jobguard_money_owner: ["app.financial_authorization.id:UPDATE", "app.journal.id:UPDATE", "app.membership.id:UPDATE"],
} as const;
