// Fictional company and captured job, constructed through the real identity,
// capture, review, quote, acceptance and v3 activation commands. No owner writes.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { ConsequentialCommand } from "@jobguard/db";

export async function ch4Company(runtime: Pool) {
  const { IdentityRepository } = await import("@jobguard/db");
  const { IdentityApplication, PersistedAuthProvider } = await import("@jobguard/api/identity");
  const pool = new Pool({ connectionString: "postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  try {
    const provider = new PersistedAuthProvider(new IdentityRepository(pool), process.env.AUTH_CODE_SECRET ?? "sbox-only-identity-hmac-secret-32-bytes");
    const identity = new IdentityApplication(provider, "http://127.0.0.1:3000");
    const email = `${randomUUID()}@ch4.invalid`;
    const challenge = await provider.requestCode({ email, purpose: "signup", ip: randomUUID() });
    const session = await provider.verifyCode(email, "signup", challenge.fixtureCode!);
    const view = await identity.session(session.sessionToken), member = view.memberships[0]!;
    const context = await identity.context({ ...session, tenantHeader: member.tenantId, origin: identity.allowedOrigin });
    return { runtime, context, actorId: member.id, tenantId: member.tenantId, ...session,
      digest: provider.digest(`session:${session.sessionToken}`) };
  } finally { await pool.end(); }
}
export type Ch4Company = Awaited<ReturnType<typeof ch4Company>>;

export async function capturedCompanyJob(a: Ch4Company) {
  const { CaptureRepository, ProposalReviewRepository, ConfirmProposalReview, UserCommandDispatcher,
    reviewContentHash, JobPartiesRepository, QuoteRepository, QuoteDeliveryRepository,
    IssueQuoteMutation, RecordBuilderAcceptanceMutation, SwitchJobLiveV3Mutation } = await import("@jobguard/db");
  const { runtime, context, actorId, tenantId } = a, captureId = randomUUID();
  const text = `Fit fictional cabinets ${randomUUID()}`;
  const provenance = { kind: "extracted" as const, span: { sourceId: captureId, sourceVersion: 1 as const, start: 0, end: text.length } };
  const captured = await new CaptureRepository(runtime).persist(context, { captureId, text,
    promptVersion: "ch4.fixture.v1", schemaVersion: "ch4.fixture.v1", model: "fixture-only",
    proposal: { title: { value: text, provenance }, lines: [{ description: { value: text, provenance },
      quantity: { value: "1", provenance }, unit: { value: "item", provenance },
      unitPricePence: { value: null, provenance: { kind: "defaulted", note: "Builder prices the quote" } } }], materials: [], questions: [] } });
  const jobId = captured.job_id as string, source = await new CaptureRepository(runtime).readByJob(context, jobId);
  const line = source!.lines[0]!;
  const review = await new ProposalReviewRepository(runtime).save(context, { version: "proposal_review_v1", reviewId: randomUUID(),
    proposalId: captured.id, jobId, revision: 0, lines: [{ id: line.id, scopeItemId: line.scope_item_id, origin: "proposal",
      description: text, room: "Kitchen", category: "Joinery", quantity: "1", unit: "item", unitPricePence: 300000,
      disposition: "accepted", dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: text }], questions: [] }, 0);
  const dispatcher = new UserCommandDispatcher(runtime);
  const command = (type: string, subjectType: string, subjectRef: string, action: ConsequentialCommand["action"]): ConsequentialCommand => ({
    version: "command.v1", commandId: randomUUID(), commandType: type, semanticKey: `${type}:${jobId}`,
    actorMembershipId: actorId, subjectType, subjectRef, action });
  const action = { recipient: null, amountPence: null, currency: null, expiresAt: new Date("2099-01-01T00:00:00Z") };
  await dispatcher.dispatch(context, command("confirm_proposal_review", "job", jobId, { ...action, actionType: "confirm_scope",
    contentHash: reviewContentHash(review), aggregateRevision: review.revision, policyVersion: "synthetic-uiwire-1" }), new ConfirmProposalReview(review));
  const parties = new JobPartiesRepository(runtime);
  const customer = await parties.command(context, actorId, jobId, { version: "job-parties-command.v1", commandId: randomUUID(), action: "create_customer",
    customer: { version: "customer.v1", name: "Fictional CH-4 customer", type: "person", email: "customer@ch4.invalid" } });
  const site = await parties.command(context, actorId, jobId, { version: "job-parties-command.v1", commandId: randomUUID(), action: "create_site",
    site: { version: "site.v1", addressLines: [`${randomUUID()} Fictional Street`], town: "London", postcode: "SW1A 1AA" } });
  const view = await parties.view(context, actorId, jobId);
  await parties.command(context, actorId, jobId, { version: "job-parties-command.v1", commandId: randomUUID(), action: "bind", expectedJobRevision: view.jobRevision,
    parties: { version: "job-parties.v1", customerRevisionId: customer.revisionId, siteRevisionId: site.revisionId } });
  const quotes = new QuoteRepository(runtime), scope = (await quotes.readWorkspace(context, jobId)).scope[0]!;
  await quotes.saveDraft(context, { jobId, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", effectiveAt: new Date(),
    lines: [{ id: randomUUID(), scopeItemId: scope.scopeItemId, scopeRevisionId: scope.scopeRevisionId, description: text, origin: "captured", included: true,
      exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 300000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Joinery", region: "London" }] });
  const delivery = new QuoteDeliveryRepository(runtime), preview = await delivery.preview(context, jobId, "customer@ch4.invalid");
  await dispatcher.dispatch(context, command("quote.send", "quote_document", preview.documentId, { ...action, actionType: "quote.send", recipient: JSON.stringify(["customer@ch4.invalid"]),
    contentHash: preview.hash, aggregateRevision: preview.document.documentVersion, policyVersion: "free-quote-send.v1" }), new IssueQuoteMutation({ tenantId, jobId,
    documentId: preview.documentId, outboxActionId: randomUUID(), recipients: ["customer@ch4.invalid"], immutableContent: new TextDecoder().decode(preview.pdf) }));
  await delivery.execute(context, jobId, preview.documentId, "success");
  const beforeAcceptance = await parties.view(context, actorId, jobId);
  await dispatcher.dispatch(context, command("quote.acceptance.attest", "quote_document", preview.documentId, { ...action, actionType: "quote.acceptance.attest", recipient: "Fictional CH-4 customer",
    contentHash: preview.hash, aggregateRevision: preview.document.documentVersion, amountPence: preview.document.totalPence, currency: "GBP", policyVersion: "builder-attestation.v1" }),
    new RecordBuilderAcceptanceMutation(tenantId, { version: "quote-acceptance.v1", acceptanceId: randomUUID(), jobId, documentId: preview.documentId,
      documentVersion: preview.document.documentVersion, documentHash: preview.hash, expectedJobRevision: beforeAcceptance.jobRevision, acceptedTotalPence: preview.document.totalPence,
      acceptedAt: new Date().toISOString(), statedCustomerName: "Fictional CH-4 customer", statedMethod: "verbal", evidenceId: null }));
  const accepted = await parties.view(context, actorId, jobId);
  await dispatcher.dispatch(context, command("job.switch_live", "job", jobId, { ...action, actionType: "job.switch_live", contentHash: preview.hash,
    aggregateRevision: preview.document.documentVersion, policyVersion: "synthetic_demo_activation.v3" }), new SwitchJobLiveV3Mutation(tenantId, {
    version: "switch-live.v3", activationId: randomUUID(), termsId: randomUUID(), jobId, acceptedDocumentId: preview.documentId,
    acceptedDocumentVersion: preview.document.documentVersion, acceptedDocumentHash: preview.hash, expectedJobRevision: accepted.jobRevision }));
  return { ...a, jobId, scopeId: line.scope_item_id as string, captureId, title: text };
}
