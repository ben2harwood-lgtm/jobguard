// Exact LP-5a additions, independently asserted against migration 0475 and PostgreSQL.
export const lp5aReadTables = [
  "proposal_review",
  "imported_job_baseline",
  "job_party_binding",
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
export const lp5aRegistryRows = [
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

// LP-5b additions are unioned with every earlier assertion.
export const lp5bReadTables = [
  "variation",
  "extra_origin",
  "customer_revision",
  "site_revision",
  "stage_completion",
  "evidence_link",
  "evidence_object",
  "scope_progress",
  "recovery_message_event",
  "recovery_follow_up",
  "recovery_follow_up_event",
  "recovery_follow_up_advance",
  "site_visit",
  "closeout_answer",
  "extra_approval_request",
  "extra_approval_revision_binding",
  "extra_approval_outcome",
  "extra_approval_step_fact",
  "extra_duplicate_link",
  "extra_order_line_link",
  "property_constraint_fact",
  "counterparty_check",
  "job_party_current",
  "inbox_finding_revision",
  "inbox_decision_revision",
  "inbox_preference_revision",
  "inbox_outcome_event",
  "watchdog_command_identity",
  "variation_revision"
];
export const lp5ReadTables = [...lp5aReadTables, ...lp5bReadTables];
export const lp5bRegistryRows = [
  {
    "command_type": "StartSiteVisit",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "site_visit",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "CompleteSiteVisit",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "site_visit",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "SubmitExtra",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "extra_chain",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "PriceExtra",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "extra_chain",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "ReviseExtra",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "extra_chain",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "ApproveExtraStep",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "extra_chain",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "RejectExtra",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "extra_chain",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "WithdrawExtra",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "extra_chain",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "RevokeClientApproval",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "extra_chain",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "ClientDecideExtra",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "extra_chain",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "MarkDuplicate",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "contractor_extra",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "LogSiteExtra",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "contractor_extra",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "RecordOfficeExtra",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "contractor_extra",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "RecordClientInstruction",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "contractor_extra",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "UnlinkDuplicate",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "contractor_extra",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "ConfirmPrompt",
    "version": "repository-command.v1",
    "permission_rule": "contractor",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "contractor_extra",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "recovery.message.preview",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "recovery_message_marker",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "recovery.message.revoke",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "recovery_message_marker",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "recovery.message.advance",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "recovery_message_marker",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "recovery.message.reconcile",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "recovery_message_marker",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "recovery.follow_up.schedule",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "recovery_follow_up_marker",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "recovery.follow_up.advance",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "recovery_follow_up_marker",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "recovery.follow_up.open_review",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "recovery_follow_up_marker",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "recovery.follow_up.cancel",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "recovery_follow_up_marker",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "prevention.check",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "prevention",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "inbox.seed",
    "version": "repository-command.v1",
    "permission_rule": "active_member",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "inbox_seed",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "commercial_integrity.review",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "operational_record",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "synthetic_demo.seed",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "operational_record",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "LogBuilderExtra",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "builder_capture",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "AddFinalReviewExtra",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "builder_capture",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "proof.complete",
    "version": "repository-command.v1",
    "permission_rule": "active_member",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "proof",
    "audit_class": "operational",
    "outbox_class": null
  },
  {
    "command_type": "job.parties",
    "version": "repository-command.v1",
    "permission_rule": "owner",
    "lock_adapter": "route_before_begin",
    "completion_adapter": "job_parties",
    "audit_class": "operational",
    "outbox_class": null
  }
];
export const lp5RegistryRows = [...lp5aRegistryRows, ...lp5bRegistryRows];
export const lp5bRoutines = [
  {
    "signature": "app.record_repository_command(uuid)",
    "owner": "jobguard_command_writer",
    "securityDefiner": true,
    "execute": [
      "jobguard_runtime",
      "jobguard_migration"
    ]
  },
  {
    "signature": "app.lp5b_contractor_permission(text,uuid,uuid,jsonb)",
    "owner": "jobguard_migration",
    "securityDefiner": true,
    "execute": [
      "jobguard_command_writer"
    ]
  },
  {
    "signature": "app.lp5b_contractor_result(uuid,jsonb)",
    "owner": "jobguard_command_writer",
    "securityDefiner": false,
    "execute": []
  },
  {
    "signature": "app.lp5b_prepare_projection(uuid)",
    "owner": "jobguard_command_writer",
    "securityDefiner": true,
    "execute": []
  },
  {
    "signature": "app.lp5b_projection_result(uuid)",
    "owner": "jobguard_command_writer",
    "securityDefiner": false,
    "execute": []
  }
];

export const lp5bReadViews = ["job_party_snapshot"];
