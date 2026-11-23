import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateSettings, verifyDatabaseTarget } from "./settings.mjs";

const captureId = "e2020000-0000-4000-8000-000000000001";
const owner = { email: "builder@jobguard-v2.invalid", name: "Fictional Bramble Button Builders" };
const second = { email: "second-builder@jobguard-v2.invalid", name: "Fictional Paper Acorn Builders" };
const customer = {
  version: "customer.v1", type: "person", name: "Fictional Pippa Patchwork",
  email: "customer@jobguard-v2.invalid", phone: "+447700900042",
};
const site = {
  version: "site.v1", addressLines: ["42 Make-Believe Mews"], town: "Sampleford", postcode: "ZY1 0AA",
};
const merchant = "Fictional Teacup Tile Merchant";
const workAreas = [
  { room: "Kitchen splashback", trade: "Tiling", contact: "Fictional Tess Tile", email: "tiler@jobguard-v2.invalid",
    work: "Fit and grout kitchen splashback tiles", quantity: "6", unit: "m2", rate: "95.00" },
  { room: "Hall decorating", trade: "Decorating", contact: "Fictional Dot Dabs", email: "decorator@jobguard-v2.invalid",
    work: "Protect, prepare and paint the hall walls and trim", quantity: "1", unit: "item", rate: "420.00" },
];
const source = [
  "JOB: Occupied-home kitchen splashback and hall decorating",
  "Keep the kitchen and hall usable for the fictional resident at the end of each day.",
  `Merchant: ${merchant} <merchant@jobguard-v2.invalid>`,
  ...workAreas.flatMap(area => [
    `${area.room}: ${area.contact} <${area.email}>`,
    `ITEM: ${area.work} | QTY: ${area.quantity} | UNIT: ${area.unit} | RATE: £${area.rate}`,
  ]),
].join("\n");

async function openFirm(identity, runtime, db, firm) {
  const { pool } = identity.provider.repository;
  const known = (await pool.query("SELECT 1 FROM identity.user_email WHERE email=$1", [firm.email])).rowCount;
  const input = { email: firm.email, purpose: known ? "signin" : "signup" };
  const origin = identity.allowedOrigin;
  const { fixtureCode } = await identity.request({ version: "identity-request.v1", ...input }, "127.0.0.1", origin);
  const { sessionToken } = await identity.verify({ version: "identity-verify.v1", ...input, code: fixtureCode }, origin);
  try {
    const sessionId = await db.enterLinkedPracticeCompany(pool, sessionToken, process.env.AUTH_CODE_SECRET, {
      version: "linked-practice-company.v1", action: "enter",
    });
    const { context } = await db.authenticatePracticeSession(runtime, sessionId);
    const profiles = new db.FirmProfileRepository(runtime);
    if (!(await profiles.read(context)).profile) {
      await profiles.save(context, {
        version: "firm-profile.v1", tradingName: firm.name, addressLines: [],
        contactEmail: firm.email, contactPhone: "",
      });
    }
    return { sessionId, close: () => identity.provider.revokeSession(sessionToken) };
  } catch (error) {
    await identity.provider.revokeSession(sessionToken);
    throw error;
  }
}

async function confirmScope(capture, saved) {
  const { jobId, proposalId, reviewId, proposal } = saved;
  const review = saved.review ?? (await capture.save(jobId, {
    contractVersion: "proposal_review_command_v1", expectedRevision: 0,
    review: {
      version: "proposal_review_v1", jobId, proposalId, reviewId, revision: 0,
      lines: proposal.lines.map((line, index) => ({
        id: line.id, scopeItemId: line.scopeItemId, origin: "proposal", description: line.description.value,
        room: workAreas[index].room, category: workAreas[index].trade, quantity: line.quantity.value,
        unit: line.unit.value, unitPricePence: line.unitPricePence.value, disposition: "accepted",
        dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt,
      })),
      questions: proposal.questions.map(({ question }) => ({
        id: randomUUID(), question: question.value, blocking: true, disposition: "answered",
        answer: "Builder removes the fictional waste at the end of the visit.",
      })),
    },
  })).review;
  await capture.confirm(jobId, {
    contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: review.revision,
  });
}

async function buildQuote(workspace, sessionId, saved, taxPolicy) {
  const { jobId } = saved;
  const { parties, capture, materials, quote } = workspace;
  const principal = { sessionId };
  const partyView = await parties.view(principal, jobId);
  if (!partyView.current) {
    await parties.command(principal, jobId, {
      version: "job-parties-command.v1", action: "save_form", commandId: randomUUID(),
      expectedJobRevision: partyView.jobRevision, expectedBindingId: null,
      customer, customerRef: null, site, savedSiteRevisionId: null, reuseSiteId: null,
      expectedReuseRevisionId: null, confirmSamePlace: false, payingPartyRevisionId: null,
      expectedPayerRevisionId: null, correct: false,
    });
  }
  if (saved.status === "draft") await confirmScope(capture, saved);
  const priced = await quote.get(jobId);
  const { skuId } = await materials.addRate({
    version: "material-rate-command.v1", merchantName: merchant, sku: "V2-SPLASHBACK-TILE",
    description: "Fictional splashback tile", pricePence: 2800, priceUnit: "box",
    taxBasis: "net", effectiveFrom: "2026-01-01", sourceLabel: "Fictional V2 merchant rate", expectedVersion: 0,
  });
  const tiling = priced.scope.find(line => line.description === workAreas[0].work);
  if (!(await materials.view(jobId)).materials.some(line => line.scopeItemId === tiling.scopeItemId)) {
    await materials.addRequirement(jobId, {
      version: "material-requirement-command.v1", scopeItemId: tiling.scopeItemId, skuId,
      quantity: "6", unit: "box", expectedRevision: 0,
    });
  }
  if (!priced.draft) {
    await quote.save(jobId, {
      contractVersion: "quote_draft_command_v1", draftId: randomUUID(), expectedRevision: 0,
      currency: taxPolicy.currency, taxPolicyVersion: taxPolicy.taxPolicyVersion,
      lines: priced.scope.map(line => ({
        ...line, id: randomUUID(), origin: "captured", included: true, exclusionReason: null,
        discountPercent: "0", taxTreatment: taxPolicy.taxTreatment, rateProvenance: "entered",
        category: workAreas.find(area => area.work === line.description).trade, region: null,
      })),
    });
  }
  const preview = await quote.preview(jobId, { version: "quote-preview-command.v1", recipient: customer.email });
  const { documentId, documentVersion, contentHash } = preview.view;
  const delivery = preview.view.status === "previewed"
    ? await quote.issue(jobId, {
      version: "quote-send-command.v1", commandId: randomUUID(), documentId, contentHash, recipient: customer.email,
    })
    : preview.view;
  if (delivery.status === "queued") {
    await quote.execute(jobId, { version: "quote-execute-command.v1", documentId, mode: "success" });
  }
  const accepted = await quote.accept(jobId, {
    version: "quote-acceptance-command.v1", commandId: randomUUID(), documentId, documentVersion,
    documentHash: contentHash, statedCustomerName: customer.name, statedMethod: "verbal",
    acceptedAt: new Date().toISOString(),
  });
  if (accepted.activeAcceptance?.documentId !== documentId) throw new Error("V2 quote acceptance was not saved");
}

export async function seedV2(client, expectedSystemId) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new Error("V2 seed requires JOBGUARD_LOCAL_V2=1");
  const { NODE_OPTIONS, ...env } = process.env;
  const { settings } = validateSettings(env);
  if (env.DATABASE_URL !== settings.DATABASE_URL || env.IDENTITY_DATABASE_URL !== settings.IDENTITY_DATABASE_URL ||
      env.S3_ENDPOINT !== settings.S3_ENDPOINT || env.S3_BUCKET !== settings.S3_BUCKET) {
    throw new Error("V2 seed requires the checked database and storage settings");
  }
  await verifyDatabaseTarget(client, expectedSystemId);
  const { rows: [existing] } = await client.query(`SELECT j.id, j.accepted_quote_version_id
    FROM app.job_record_proposal p JOIN app.job j ON (j.tenant_id,j.id)=(p.tenant_id,p.job_id)
    WHERE p.capture_id=$1`, [captureId]);
  if (existing?.accepted_quote_version_id) return existing.id;

  await import("./network.mjs");
  const [{ Pool }, db, { createIdentityApplication }, { createWorkspaceApplication }, { M1_QUOTE_POLICY }] = await Promise.all([
    import("../../packages/db/node_modules/pg/esm/index.mjs"),
    import("../../packages/db/dist/index.js"),
    import("../../apps/api/dist/auth/index.js"),
    import("../../apps/api/dist/workspace/index.js"),
    import("../../packages/core/dist/index.js"),
  ]);
  const identity = createIdentityApplication(process.env);
  const pool = new Pool({ connectionString: settings.DATABASE_URL, max: 1 });
  try {
    const other = await openFirm(identity, pool, db, second);
    await other.close();
    const builder = await openFirm(identity, pool, db, owner);
    try {
      const workspace = createWorkspaceApplication({ pool, sessionId: builder.sessionId });
      const saved = await workspace.capture.create({
        contractVersion: "job_capture_v1", requested_tenant_id: db.DEMO_TENANT_ID, captureId,
        fixtureId: "v2-a2-occupied-home", source: { kind: "text", text: source },
      });
      await buildQuote(workspace, builder.sessionId, saved, M1_QUOTE_POLICY);
      return saved.jobId;
    } finally {
      await builder.close();
    }
  } finally {
    await Promise.all([pool.end(), identity.provider.repository.pool.end()]);
  }
}

export function printSeedLinks(origin, jobId) {
  console.log(`V2 owner sign-in: ${owner.email} at ${origin}/sign-in`);
  console.log(`V2 accepted quote: ${origin}/jobs/${jobId}/work#quote`);
}
