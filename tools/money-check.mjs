// Hand-worked penny checks for DEMO-S quotes, VAT, receipts, fees and Northside billing/statement/dashboard.
// Synthetic inputs only: no database, browser or live money; database audit repairs D/E/G remain named todos.

// Independent oracle. BUILD_PLAN §§3.2, 9.1, 10.3, DEMO-S and Appendix B.
// VAT: candidate standard 20%, half-up once per net group. Fees: 10%, cumulative half-even.
// Every value below is a literal worked from scenario inputs, never imported from the application.
export const expected = {
  'core-1000': {
    quoteV1Net: 90000, // 20000 + 20000 + 20000 + 20000 + 10000 = 90000
    quoteNet: 100000, // 20000 + 20000 + 20000 + 20000 + 20000 = 100000
    quoteVat: 20000, // 100000 × 20 / 100 = 20000; half-up, exact
    quoteGross: 120000, // 100000 + 20000 = 120000
    approvedExtras: 12500, // 1 × 12500 = 12500
    approvedOmissions: -2500, // 0 - 2500 = -2500
    pendingContribution: 0, // unapproved 5000 adds zero
    finalNet: 110000, // 100000 + 12500 - 2500 + 0 = 110000
    vat: 22000, // 110000 × 20 / 100 = 22000; half-up, exact
    gross: 132000, // 110000 + 22000 = 132000
    partPaid: 50000, // first receipt = 50000
    partOutstanding: 82000, // 132000 - 50000 = 82000
    paidOutstanding: 0, // 132000 - 50000 - 82000 = 0
    reversedOutstanding: 82000, // 132000 - 50000 - 82000 + 82000 = 82000
    correctionGross: 12000, // 10000 + (10000 × 20 / 100) = 12000; half-up, exact
    correctedOutstanding: 70000, // 132000 - 50000 - 12000 = 70000
    successFee: 0, // builder captures, no qualifying recovery: 0 × 10 / 100 = 0
  },
  'recovery-18800': {
    quoteNet: 1880000, // accepted baseline = 1880000
    vat: 376000, // 1880000 × 20 / 100 = 376000; half-up, exact
    gross: 2256000, // 1880000 + 376000 = 2256000
    firstNet: 32000, // separate receipt 38400 = 32000 net + 6400 VAT
    secondNet: 250000, // separate receipt 300000 = 250000 net + 50000 VAT
    recovered: 282000, // 32000 + 250000 = 282000
    firstFee: 3200, // 32000 × 10 / 100 = 3200; half-even, exact
    secondFee: 25000, // 282000 × 10 / 100 - 3200 = 25000; half-even, exact
    statementFee: 28200, // 3200 + 25000 = 28200
    reversedNet: -250000, // reverse second receipt: 0 - 250000 = -250000
    remainingFee: 3200, // (282000 - 250000) × 10 / 100 = 3200; half-even, exact
    refund: 25000, // 28200 - 3200 = 25000
    yours: 28800, // 32000 - 3200 = 28800
    differences: 0, // expected fee 3200 - net collected (28200 - 25000) = 0
    realActions: 0, // synthetic-only external actions = 0
  },
  'shadow-30000': {
    quoteNet: 3000000, // 600000 + 600000 + 600000 + 600000 + 600000 = 3000000
    captures: 360000, // 320000 logged + 40000 final-review = 360000
    lockedNet: 3360000, // 3000000 + 320000 + 40000 = 3360000
    found: 80000, // 50000 + 30000 = 80000
    finalNet: 3440000, // 3360000 + 50000 + 30000 = 3440000
    vat: 688000, // 3440000 × 20 / 100 = 688000; half-up, exact
    gross: 4128000, // 3440000 + 688000 = 4128000
    qualifyingNet: 80000, // own captures 360000 excluded; catches 50000 + 30000 = 80000
    captureFee: 0, // builder captures 360000 contribute zero qualifying principal
    successFee: 8000, // 80000 × 10 / 100 = 8000; half-even, exact
    yours: 72000, // 80000 - 8000 = 72000
    outstanding: 0, // 4128000 invoice - 4128000 receipt = 0
  },
  trial: {
    subscription: 0, // active free trial: 0 base + 0 extras = 0
    successFee: 0, // no settled qualifying recovery: 0 × 10 / 100 = 0
  },
  Northside: {
    exportNet: 108000, // CLEAR-VOID 18000 × quantity 6 = 108000 (ENT-11b surveyor quote)
    invoiceNet: 208000, // original order 100000 + extra 108000 = 208000
    vat: 41600, // 208000 × 20 / 100 = 41600; half-up, exact
    gross: 249600, // 208000 + 41600 = 249600
    billedFee: 0, // billed but unpaid: 0 qualifying settled principal
    partGross: 124800, // first half: 60000 order gross + 64800 extra gross = 124800
    partOrderNet: 50000, // 124800 × 120000 / 249600 × 100000 / 120000 = 50000; exact, no rounding
    partExtraNet: 54000, // 124800 × 129600 / 249600 × 108000 / 129600 = 54000; exact
    partOutstanding: 124800, // 249600 - 124800 = 124800
    partFee: 5400, // 54000 × 10 / 100 = 5400; half-even, exact
    paidGross: 249600, // 124800 + 124800 = 249600
    paidExtraNet: 108000, // 54000 + 54000 = 108000
    outstanding: 0, // 249600 - 124800 - 124800 = 0
    statementFee: 10800, // 108000 × 10 / 100 = 10800; half-even, exact
    rejectedContribution: 0, // rejected extra 108000 contributes zero qualifying principal
    withdrawnContribution: 0, // withdrawn extra 108000 contributes zero qualifying principal
    rejectedFee: 0, // rejected extra contributes zero
    withdrawnFee: 0, // withdrawn extra contributes zero
    dashboardBilled: 108000, // only matched extra: 108000; order 100000 adds zero
    dashboardPaid: 108000, // matched extra settlements 54000 + 54000 = 108000
  },
};

// These are database lifecycle failures, not failures of the pure arithmetic kernel.
// Keep the money oracle here; the named repairs must add/run the real PostgreSQL journey.
export const knownOpen = [
  { id: 'D', piece: 'LATER-SAFETY-76', audit: 'j06 B1 / j03 B1',
    scenario: 'October posted 500p; previously unstated September cumulative fee 300p: refuse earlier statement',
    expectedDelta: 0, // no new charge or compensation; October book stays 500p, not 500 - 200 = 300p
  },
  { id: 'E', piece: 'LATER-SAFETY-77', audit: 'j01 B1',
    scenario: 'Catch R1 20000p -> R2 25000p -> customer approves R2 -> invoice and allocate R2',
    expectedAllocated: 25000, // approved R2 25000 + zero from superseded R1 = 25000
    expectedFee: 2500, // 25000 × 10 / 100 = 2500; half-even, exact
  },
  { id: 'G', piece: 'LATER-SAFETY-78', audit: 'j03 B2',
    scenario: 'Awaiting-approval extra 15000p -> wrongly duplicate -> unlink -> approve and bill',
    expectedRestored: 15000, // canonical 0 + restored distinct extra 15000 = 15000
    expectedFee: 1500, // after settlement: 15000 × 10 / 100 = 1500; half-even, exact
  },
];

export function comparePennies(scenario, actual, table = expected) {
  const rows = table[scenario];
  if (!rows) throw new Error(`Unknown money scenario: ${scenario}`);
  for (const [line, wanted] of Object.entries(rows)) {
    const observed = actual[line];
    if (!Number.isSafeInteger(wanted) || !Number.isSafeInteger(observed) || observed !== wanted) {
      throw new Error(`${scenario} / ${line}: expected ${wanted}p, actual ${observed}p`);
    }
  }
}
