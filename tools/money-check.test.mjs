import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { comparePennies, expected, knownOpen } from './money-check.mjs';

// Test-process-only source loader: .js imports in TypeScript resolve to their source.
// No compiled dist (which could be stale), downloads, build step or product edits.
const root = new URL('../', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith(root)) {
      const source = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(source)) return { url: source.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(root) && url.endsWith('.ts') && !url.includes('/node_modules/')) {
      const { outputText } = ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: url,
      });
      return { format: 'module', source: outputText, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { evaluateDraftQuote } = await import('../packages/core/src/quote.ts');
const { assembleDraftFinalAccount } = await import('../packages/core/src/final-account.ts');
const { allocateReceiptToLines } = await import('../packages/core/src/receipt-allocation.ts');
const { calculateCumulativeFee } = await import('../packages/core/src/cumulative-fee.ts');
const { calculateNetLine, parseQuantity } = await import('../packages/core/src/quantity.ts');
const { money } = await import('../packages/core/src/money.ts');
const { computeSuppliedMeterPeriod, syntheticMeterPolicyV1 } = await import('../packages/core/src/jobs-on-the-go.ts');
const { trialPeriodAuthority } = await import('../packages/core/src/free-first-job-conversion.ts');
const { trialDeadlineV1, approvedTrialClockV1 } = await import('../packages/core/src/free-first-job-calendar.ts');
const { deriveUnambiguousBilling } = await import('../packages/core/src/contractor-billing.ts');
const { projectDashboardBilling } = await import('../packages/core/src/enterprise-dashboard-billing.ts');
const { deriveEnterpriseReferenceStatement } = await import('../packages/core/src/enterprise-domain/fee.ts');
// Invoke only the existing synchronous row projection, with synthetic rows. No Pool is created,
// no queries run. SQL aggregation/authorization/replay guarantees are outside this checker.
const { PracticeInvoiceRepository } = await import('../packages/db/src/practice-invoice-repository.ts');

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = 'a'.repeat(64), at = '2026-10-05T12:00:00Z';
const exact = n => ({ numerator: String(n), denominator: '1' });
function integer(value) {
  const numerator = BigInt(value.numerator), denominator = BigInt(value.denominator);
  assert.equal(numerator % denominator, 0n, 'scenario allocation must be an exact integer penny');
  return Number(numerator / denominator); // Exact only; never round intermediate receipt allocations.
}
function quote(rates) {
  return evaluateDraftQuote({ currency: 'GBP', taxPolicyVersion: 'candidate_m1_standard_v1',
    lines: rates.map((rate, i) => ({ id: id(i + 1), scopeItemId: id(i + 20), scopeRevisionId: id(i + 40),
      description: `Fictional scope ${i}`, origin: 'captured', included: true, exclusionReason: null,
      quantity: '1', unit: 'item', unitRatePence: rate, discountPercent: '0', taxTreatment: 'standard_rate_20',
      rateProvenance: 'entered', category: null, region: null })) }).totals;
}
function finalAccount(baseline, extras = []) {
  const line = (netPence, i, kind, approvalId) => ({ kind, sourceId: id(i + 100), scopeItemId: id(i + 200),
    commercialRevisionId: id(i + 300), description: 'Fictional work', netPence, approvalId });
  return assembleDraftFinalAccount({ baselineLines: baseline.map((n, i) => line(n, i, 'baseline', null)),
    approvedVariationLines: extras.map((e, i) => line(e.net, i + 10, 'variation', e.approved ? id(i + 400) : null)),
    proof: [], mandatoryProofRequirements: [] }).totals;
}
function fee(principal, prior = 0) {
  return calculateCumulativeFee({ version: 'cumulative-fee.v1',
    rate: { version: 'fee-rate.v1', policyVersion: 'reference_fee_policy_v3', numerator: '1', denominator: '10' },
    cumulativeQualifyingPrincipal: exact(principal), priorNetPostedPence: prior,
    priorPolicyVersion: 'reference_fee_policy_v3', compensatesDerivationId: prior ? id(900) : null });
}
function invoiceView(net, tax, total, paid = 0, credited = 0) {
  // Exercise the exact row mapper used by list/read receipts, without mocking a database.
  return PracticeInvoiceRepository.prototype.map({ id: id(600), invoice_number: 'PRACTICE-1',
    issued_date: '2026-10-05', pdf_sha256: hash, final_account_revision_id: id(601), source_hash: hash,
    net_pence: net, tax_pence: tax, total_pence: total, paid_pence: paid, credited_pence: credited });
}
function allocate(net, gross, receipt, direction = 'receipt', rule = 'separate_invoice') {
  return allocateReceiptToLines({ version: 'receipt-allocation.v1', sourceRef: `fictional-${direction}`,
    receiptGross: exact(receipt), effectiveAt: at, direction, invoiceId: 'invoice',
    separateInvoiceId: rule === 'separate_invoice' ? 'invoice' : null,
    explicit: rule === 'explicit' ? [{ lineId: 'line', gross: exact(receipt) }] : null,
    lines: [{ id: 'line', invoiceId: 'invoice', existedAt: at, outstandingGross: exact(gross), netPence: net, grossPence: gross }] })[0];
}

test('MONEY-CHECK core-1000: five-line quote, approved-only extras, VAT, part-payment, reversal and correction', () => {
  // core-1000/journey-model.ts source and DEMO-J1-core-1000.spec.ts command inputs.
  const v1 = quote([20000, 20000, 20000, 20000, 10000]);
  const v2 = quote([20000, 20000, 20000, 20000, 20000]);
  const extras = [{ net: 12500, approved: true }, { net: -2500, approved: true }, { net: 5000, approved: false }];
  const bill = finalAccount([100000], extras);
  const withoutPending = finalAccount([100000], extras.slice(0, 2));
  const view = (paid, credited = 0) => invoiceView(bill.net.pence, bill.tax.pence, bill.total.pence, paid, credited);
  const correction = quote([10000]);
  comparePennies('core-1000', {
    quoteV1Net: v1.net.pence, quoteNet: v2.net.pence, quoteVat: v2.tax.pence, quoteGross: v2.total.pence,
    approvedExtras: finalAccount([], [extras[0]]).net.pence, approvedOmissions: finalAccount([], [extras[1]]).net.pence,
    pendingContribution: bill.net.pence - withoutPending.net.pence,
    finalNet: bill.net.pence, vat: bill.tax.pence, gross: bill.total.pence,
    partPaid: view(50000).paidPence, partOutstanding: view(50000).balancePence,
    paidOutstanding: view(132000).balancePence, reversedOutstanding: view(50000).balancePence,
    correctionGross: correction.total.pence, correctedOutstanding: view(50000, correction.total.pence).balancePence,
    successFee: fee(0).cumulativeFee.pence,
  });
});

test('MONEY-CHECK recovery-18800: separate settled receipts, cumulative v3 statement and reversal refund', () => {
  const q = quote([1880000]);
  // BUILD_PLAN F10 / DEMO-S: two separate remitted receipts, not the invoice gross as a fee base.
  const first = allocate(32000, 38400, 38400, 'receipt', 'explicit'), second = allocate(250000, 300000, 300000);
  assert.equal(first.rule, 'explicit');
  assert.equal(second.rule, 'separate_invoice');
  const recovered = integer(first.net) + integer(second.net), firstFee = fee(integer(first.net));
  const combined = fee(recovered, firstFee.cumulativeFee.pence);
  const reversed = allocate(250000, 300000, 300000, 'reversal');
  const remaining = recovered + integer(reversed.net), compensation = fee(remaining, combined.cumulativeFee.pence);
  const refund = -compensation.postingDelta.pence;
  comparePennies('recovery-18800', { quoteNet: q.net.pence, vat: q.tax.pence, gross: q.total.pence,
    firstNet: integer(first.net), secondNet: integer(second.net), recovered,
    firstFee: firstFee.postingDelta.pence, secondFee: combined.postingDelta.pence, statementFee: combined.cumulativeFee.pence,
    reversedNet: integer(reversed.net), remainingFee: compensation.cumulativeFee.pence, refund,
    yours: remaining - compensation.cumulativeFee.pence,
    differences: compensation.cumulativeFee.pence - (combined.cumulativeFee.pence - refund), realActions: 0 });
});

test('MONEY-CHECK shadow-30000: captures are fee-free, both catches share the paid blended invoice', () => {
  const base = [600000, 600000, 600000, 600000, 600000], q = quote(base);
  const captures = [{ net: 320000, approved: true }, { net: 40000, approved: true }];
  const locked = finalAccount(base, captures);
  const bill = finalAccount(base, [...captures, { net: 50000, approved: true }, { net: 30000, approved: true }]);
  const allocations = allocateReceiptToLines({ version: 'receipt-allocation.v1', sourceRef: 'shadow-settled',
    receiptGross: exact(4128000), effectiveAt: at, direction: 'receipt', invoiceId: 'shadow', separateInvoiceId: null, explicit: null,
    lines: [[3360000, 4032000], [50000, 60000], [30000, 36000]].map(([netPence, grossPence], i) => ({
      id: `line-${i}`, invoiceId: 'shadow', existedAt: at, outstandingGross: exact(grossPence), netPence, grossPence })) });
  const qualifyingNet = integer(allocations[1].net) + integer(allocations[2].net), charge = fee(qualifyingNet);
  comparePennies('shadow-30000', { quoteNet: q.net.pence, captures: finalAccount([], captures).net.pence,
    lockedNet: locked.net.pence, found: bill.net.pence - locked.net.pence, finalNet: bill.net.pence,
    vat: bill.tax.pence, gross: bill.total.pence, qualifyingNet, captureFee: fee(0).cumulativeFee.pence,
    successFee: charge.cumulativeFee.pence, yours: qualifyingNet - charge.cumulativeFee.pence,
    outstanding: invoiceView(bill.net.pence, bill.tax.pence, bill.total.pence, 4128000).balancePence });
});

test('MONEY-CHECK trial: active first-job trial charges no subscription or recovery without cash', () => {
  // Guided trial binds user-created jobs; it has no fixed quote price. Check its free money boundary.
  const startedAt = '2026-10-01T00:00:00.000000Z';
  const authority = trialPeriodAuthority({ version: 'trial-conversion-input.v1', environment: 'synthetic_demo', sourceId: id(80),
    timeline: { version: 'trial-end-input.v1', trialId: id(81), tenantId: id(20), jobId: id(21), startedAt,
      deadline: trialDeadlineV1(startedAt, approvedTrialClockV1), asOf: '2026-10-31T23:59:59.000000Z', events: [] },
    periodStart: '2026-10-01', periodEndExclusive: '2026-11-01', anchorDay: 1,
    terms: [{ id: id(82), revision: 1, effectiveDate: '2026-10-01', plan: 'Solo', cadence: 'monthly' }] });
  const period = computeSuppliedMeterPeriod({ version: 'meter-supplied-period.v1', environment: 'synthetic_demo',
    policy: syntheticMeterPolicyV1, startDate: '2026-10-01', endDateExclusive: '2026-11-01',
    days: authority.days.map(day => ({ date: day.date, plan: day.plan,
      annualPrepaid: day.annualPrepaid, trial: day.trial, countedPlaces: 1 })) });
  comparePennies('trial', { subscription: period.principal.pence, successFee: fee(0).cumulativeFee.pence });
});

// ENT-11b input recipe: CLEAR-VOID × 6 and one original-order invoice line.
// Prices here are inputs; none of the expected table is referenced to construct them.
const match = { exportLineId: id(7), jobId: id(21), extraId: id(1), scopeItemId: id(22), revisionId: id(2), revisionHash: hash };
function northsideEvents() {
  const event = (sourceEventId, factType, netPence, vatPence, grossPence, patch = {}) => ({
    version: 'billing-status.v1', clientContractId: id(50), source: 'northside-fictional', sourceEventId,
    invoiceNumber: 'NS-INVOICE-1', factType, effectiveAt: at, remittanceReference: null, reconciliationId: null,
    originalEventId: null, amount: { netPence, vatPence, grossPence }, composition: null, explicit: null,
    separateInvoice: false, lineAdjustments: [], ...patch });
  return [event('invoice', 'invoiced', 208000, 41600, 249600, { effectiveAt: '2026-10-02T12:00:00Z',
    composition: { declared: { netPence: 208000, vatPence: 41600, grossPence: 249600 }, lines: [
      { externalInvoiceLineId: 'order', kind: 'original_order', existedAt: at, netPence: 100000, vatPence: 20000, grossPence: 120000, match: null },
      { externalInvoiceLineId: 'extra', kind: 'extra', existedAt: at, netPence: 108000, vatPence: 21600, grossPence: 129600, match },
    ] } }), event('part', 'paid', 104000, 20800, 124800, { reconciliationId: 'northside-part' }),
    event('balance', 'paid', 104000, 20800, 124800, { reconciliationId: 'northside-balance', effectiveAt: '2026-10-06T12:00:00Z' })];
}
function northsideGroup(billing, state = 'paid') {
  const grant = (role, membershipId) => ({ id: id(30), tenantId: id(20), jobId: id(21), membershipId, role });
  const identity = { tenantId: id(20), jobId: id(21), scopeItemId: id(22), revisionId: id(2), revisionHash: hash,
    exportLineId: id(7), invoiceId: 'NS-INVOICE-1', invoiceLineId: 'extra', recordedAt: at, effectiveAt: at, status: 'finalized' };
  const facts = [{ ...identity, kind: 'invoiced', net: exact(108000), sourceRef: 'invoice', allocationRule: null, originalSourceRef: null },
    ...billing.allocations.map(a => ({ ...identity, kind: 'settled', net: a.lines.find(l => l.lineId === 'extra').net,
      sourceRef: a.sourceRef, allocationRule: 'pro_rata', originalSourceRef: null }))];
  return { version: 'enterprise-group.v1', tenantId: id(20), jobId: id(21), jobTrack: 'contractor', currency: 'GBP',
    mode: 'synthetic_demo', feeGate: false, canonicalId: id(1), unresolvedCandidateIds: [], agreementVersionId: 'northside-v1',
    members: [{ id: id(1), tenantId: id(20), jobId: id(21), scopeItemId: id(22), state, duplicateOf: null,
      billingBalances: null, workDone: false, exportedAt: at, exportLineId: id(7), billingFacts: facts,
      revision: { id: id(2), hash, serverRecordedAt: at, netPence: 108000, priceConfirmed: true, priceSource: 'surveyor_quoted',
        requirement: { ruleVersion: 'northside-rules', steps: [{ role: 'supervisor', alternates: [] }], photoRequired: false, residentRequired: false },
        approvals: [{ index: 0, revisionId: id(2), hash, netPence: 108000, ruleVersion: 'northside-rules', actorId: id(31),
          grant: grant('supervisor', id(31)), role: 'supervisor', timing: 'before_work', serverRecordedAt: at }] },
      origin: { version: 'extra-origin.v1', tenantId: id(20), jobId: id(21), variationId: id(1),
        origin: { version: 'variation-origin.v1', jobTrack: 'contractor', kind: 'site_user' }, commandId: id(3),
        raisingMembershipId: id(4), raisingRole: 'operative', serverRecordedAt: at, deviceId: 'fictional-device', deviceCapturedAt: at, evidenceHash: hash },
      raisingCommand: { id: id(3), type: 'LogSiteExtra', actorId: id(4), role: 'operative', grant: grant('operative', id(4)), assigned: true },
      orderAtOrigin: { revisionId: id(5), hash, coverage: 'new' }, captureNote: 'Fictional extra',
      photo: { status: 'none', evidenceId: null, hash: null, tenantId: null, jobId: null, scopeItemId: null, objectVersionId: null },
      residentCaptured: false, residentConfirmationHash: null, prompt: null }] };
}
function statement(billing, state) {
  return deriveEnterpriseReferenceStatement({ version: 'enterprise-statement.v1', tenantId: id(20), period: '2026-10',
    statementId: id(100), inputFactsHash: hash, recordedCutoff: '2026-11-01T00:00:00Z', mode: 'synthetic_demo', feeGate: false,
    groups: [northsideGroup(billing, state)], prior: [], agreements: [{ version: 'enterprise-agreement.v1', id: 'northside-v1',
      tenantId: id(20), hash, effectiveFrom: '2026-01-01T00:00:00Z',
      rate: { version: 'fee-rate.v1', policyVersion: 'northside-v1', numerator: '1', denominator: '10' },
      basis: 'on_payment', minimumCommitment: null, onboardingFee: null, volumeBands: null }] }).sections[0];
}

test('MONEY-CHECK Northside: export -> billed -> part-paid -> paid -> statement -> dashboard', () => {
  const events = northsideEvents(), billed = deriveUnambiguousBilling(events.slice(0, 1));
  const part = deriveUnambiguousBilling(events.slice(0, 2)), paid = deriveUnambiguousBilling(events);
  assert.deepEqual(paid.held, [], 'Northside must not hide a held billing input');
  const dashboard = projectDashboardBilling([events], new Map([[id(1), { jobId: id(21), canonicalExtraId: id(1) }]]));
  const q = quote([100000, 108000]);
  const view = amount => invoiceView(q.net.pence, q.tax.pence, q.total.pence, amount);
  comparePennies('Northside', { exportNet: calculateNetLine(parseQuantity('6'), money(18000)).pence,
    invoiceNet: integer(paid.totals.billedNet), vat: q.tax.pence, gross: q.total.pence,
    billedFee: statement(billed, 'billed').postingDelta.pence, partGross: integer(part.totals.paidGross),
    partOrderNet: integer(part.lines.find(l => l.lineId === 'order').paidNet),
    partExtraNet: integer(part.totals.matchedExtraNet), partOutstanding: view(integer(part.totals.paidGross)).balancePence,
    partFee: statement(part, 'part_paid').postingDelta.pence, paidGross: integer(paid.totals.paidGross),
    paidExtraNet: integer(paid.totals.matchedExtraNet), outstanding: view(integer(paid.totals.paidGross)).balancePence,
    statementFee: statement(paid, 'paid').postingDelta.pence,
    rejectedContribution: integer(statement(paid, 'rejected').qualifyingPrincipal),
    withdrawnContribution: integer(statement(paid, 'withdrawn').qualifyingPrincipal), rejectedFee: statement(paid, 'rejected').postingDelta.pence,
    withdrawnFee: statement(paid, 'withdrawn').postingDelta.pence,
    dashboardBilled: dashboard.totals.billed.known.pence, dashboardPaid: dashboard.totals.paid.known.pence });
});

// The audited operations live in SQL, not the pure kernels. Do not turn a passing
// pure-kernel example into a false claim that the database lifecycle has been repaired.
for (const item of knownOpen) test.todo(`MONEY-CHECK known-open ${item.id}: ${item.piece} (${item.audit}) — ${item.scenario}`);

test('MONEY-CHECK comparer reports scenario, line and both penny amounts', () => {
  assert.throws(() => comparePennies('trial', { subscription: 1, successFee: 0 }),
    /trial \/ subscription: expected 0p, actual 1p/);
  assert.throws(() => comparePennies('trial', {}), /expected 0p, actual undefinedp/);
  assert.throws(() => comparePennies('trial', { subscription: 0.5, successFee: 0 }), /expected 0p, actual 0.5p/);
  assert.ok(Object.values(expected).every(rows => Object.values(rows).every(Number.isSafeInteger)));
});
