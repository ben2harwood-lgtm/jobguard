// Exact LP-5a additions, independently asserted against migration 0475 and PostgreSQL.
export const lp5ReadTables = [
  "proposal_review",
  "imported_job_baseline",
  "job_import_v3",
  "trial_admission",
  "membership",
  "job",
  "job_activation",
  "job_activation_terms",
  "cap_snapshot",
  "synthetic_obligation",
  "simulated_settlement_event",
  "quote_acceptance",
  "acceptance_event",
  "activation_acceptance_operation_use",
  "quote_send",
  "quote_document_version",
  "final_account_revision",
  "customer_invoice",
  "customer_credit_note",
  "customer_payment",
  "customer_payment_reversal",
  "purchase_order_placement",
  "purchase_order_revision",
  "recovery_case_terms_approval",
  "recovery_message_approval",
  "recovery_message",
  "extra_client_link",
  "extra_client_link_closure",
  "job_finding",
  "audit_event",
  "action_outbox",
  "decision",
  "decision_resolution",
  "action_authorization",
  "command_receipt"
];
export const lp5RegistryRows = [
  {
    "command_type": "confirm_proposal_review",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "review",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "job.adopt_in_flight",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "import",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "job.adopt_in_flight_v3",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "import_v3",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "customer_payment.record",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "payment",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "quote.issue",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "quote_send",
    "audit_class": "commercial",
    "outbox_class": "fake_quote_delivery"
  },
  {
    "command_type": "job.switch_live",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "activation",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "synthetic.settlement",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "settlement",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "quote.acceptance.attest",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "acceptance",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "quote.declined",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "disposition",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "quote.superseded",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "disposition",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "quote.acceptance_cancelled",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "disposition",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "quote.send",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "quote_send",
    "audit_class": "commercial",
    "outbox_class": "fake_quote_delivery"
  },
  {
    "command_type": "customer_invoice.issue",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "invoice",
    "audit_class": "commercial",
    "outbox_class": "fake_invoice_delivery"
  },
  {
    "command_type": "customer_credit_note.issue",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "credit",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "customer_payment.reverse",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "payment_reversal",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "purchase_order.simulate",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "purchase_order",
    "audit_class": "commercial",
    "outbox_class": "fake_purchase_order"
  },
  {
    "command_type": "recovery.terms.approve",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "recovery_terms",
    "audit_class": "commercial",
    "outbox_class": null
  },
  {
    "command_type": "recovery.message.approve",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "message",
    "audit_class": "commercial",
    "outbox_class": "fake_recovery_message"
  },
  {
    "command_type": "recovery.follow_up.approve_reminder",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "message",
    "audit_class": "commercial",
    "outbox_class": "fake_recovery_message"
  },
  {
    "command_type": "IssueClientApproval",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "client_link",
    "audit_class": "commercial",
    "outbox_class": "fake_email"
  },
  {
    "command_type": "finding.resolve",
    "version": "decision-resolution-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "finding",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "synthetic.lock",
    "version": "command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "synthetic_lock_noop",
    "audit_class": "operational",
    "outbox_class": null
  }
];
export const lp5Signatures = [
  "app.lp5_bind_effect(uuid,uuid,text,jsonb)",
  "app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb)",
  "app.complete_command(uuid,jsonb)",
  "app.lp5_command_result(uuid,jsonb)",
  "app.lp5_check_command_completion()",
];
