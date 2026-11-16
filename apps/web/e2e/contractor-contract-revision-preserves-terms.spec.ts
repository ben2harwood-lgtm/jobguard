import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';
import type { ContractorWorkspace } from '@jobguard/core';
import { installContractorAgreementFixture } from './contractor-agreement-fixture.js';

// RED: both configured projects use real command handlers and PostgreSQL.
// The existing fictional agreement fixture is the only setup write outside those handlers.
test.setTimeout(240_000);
test.beforeEach(async ({ page }) => { await installContractorAgreementFixture(page); });
const base = 'http://127.0.0.1:3000';
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function expectAdminFitsViewport(page: Page) {
  await expect(page).toHaveURL(/\/admin\/contractor$/);
  // Root overflow is hidden globally, so also inspect the actual content and controls.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const overflow = await page.locator('main').evaluate(main => {
    const width = document.documentElement.clientWidth;
    return [main, ...main.querySelectorAll('*')].flatMap(element => {
      if (!element.getClientRects().length) return [];
      const rect = element.getBoundingClientRect();
      const outsideViewport = rect.left < -1 || rect.right > width + 1;
      const clippedContent = element.matches('main, section, button, a, pre') && element.scrollWidth > element.clientWidth + 1;
      return outsideViewport || clippedContent ? [{ tag: element.tagName, text: element.textContent?.slice(0, 80), left: rect.left, right: rect.right }] : [];
    });
  });
  expect(overflow, 'Contractor admin content and controls fit the viewport').toEqual([]);
}
async function workspace(page: Page): Promise<ContractorWorkspace> {
  const response = await page.request.get('/api/contractor');
  expect(response.status()).toBe(200);
  return response.json();
}
async function revise(page: Page, current: ContractorWorkspace, fields: Record<string, unknown>) {
  return page.request.post('/api/contractor', { headers: { origin: base }, data: {
    version: 'contractor-command.v1', environment: 'synthetic_demo', commandId: crypto.randomUUID(),
    id: crypto.randomUUID(), expectedRevision: current.revision, kind: 'contract.revise', ...fields,
  } });
}

test('revising only the approval limit preserves stored terms and subsequent order pricing', async ({ page }) => {
  const db = new Pool({ host: '127.0.0.1', port: 55432, user: 'postgres', password: 'sbox-e2e-owner', database: 'jobguard_synthetic_demo', max: 1 });
  try {
    await page.goto('/admin/contractor');
    await button(page, 'Start generated contractor practice').click();
    await expect(page.getByTestId('contractor-revision')).toHaveText('0');
    await expectAdminFitsViewport(page);
    // ENT-2's supported generated import prepares the genuine client, contract and usable schedule.
    await page.goto('/contractor/work-orders');
    await page.getByLabel(/Orders with problems/).check();
    await button(page, 'Import selected file').click();
    await expect(page.getByTestId('import-counts')).toHaveText('2 created · 0 revised · 0 unchanged · 5 refused (of 7 rows)');
    let current = await workspace(page);
    const original = current.contracts.find(x => x.document.reference === 'FICTIONAL-HA-2026')!;
    expect(original.document.sorVersionIds).toHaveLength(1);
    const commercialDocument = { ...original.document, reference: 'FICTIONAL-PRESERVED-TERMS', startsOn: '2025-01-02', endsOn: '2029-12-31', tenderedAdjustment: { numerator: '17', denominator: '200' }, photoRule: 'optional', exportedNotBilledAlertDays: 73 };
    const rules = { ...original.rules, proceedLimit: { pence: 12345, currency: 'GBP' }, bands: [{ upToPence: null, steps: [{ role: 'surveyor', timeLimitMinutes: 123, escalationRole: null, alternateRoles: [] }] }], clientApproval: { kind: 'threshold', abovePence: 900, beforeWorkAbovePence: 800, timeLimitMinutes: 99 }, evidence: { photosRequired: false, residentConfirmationRequired: true } };
    const fields = { clientId: original.client_id, contractId: original.contract_id, document: commercialDocument, rules };
    expect((await revise(page, current, fields)).status()).toBe(200);
    current = await workspace(page);
    const history = structuredClone(current.contracts);
    const storedVersions = async () => (await db.query('SELECT * FROM app.client_contract_version WHERE tenant_id=$1 AND contract_id=$2 ORDER BY revision', [current.tenantId, original.contract_id])).rows;
    const previousRows = await storedVersions();
    const effects = async () => (await db.query(`SELECT
      (SELECT count(*)::int FROM app.action_outbox WHERE tenant_id=$1) sends,
      (SELECT count(*)::int FROM app.synthetic_obligation WHERE tenant_id=$1) obligations,
      (SELECT count(*)::int FROM app.recovery_fee_journal WHERE tenant_id=$1) fees,
      (SELECT count(*)::int FROM app.journal WHERE tenant_id=$1) journals`, [current.tenantId])).rows;
    const beforeEffects = await effects();
    await page.goto('/admin/contractor');
    await expect(page.getByTestId('contractor-revision')).toHaveText(String(current.revision));
    await page.getByLabel('Existing contract').selectOption(original.contract_id);
    await expect(page.getByLabel('Contract client')).toHaveValue(original.client_id);
    await expect(page.getByLabel('Proceed limit (£)')).toHaveValue('123.45');
    await page.getByLabel('Proceed limit (£)').fill('333.07');
    await button(page, 'Save contract version').click();
    await expect(page.getByTestId('contractor-revision')).toHaveText(String(current.revision + 1));
    await page.reload();
    await expect(page.getByTestId('contractor-revision')).toHaveText(String(current.revision + 1));
    const saved = await workspace(page);
    expect(saved.contracts.filter(x => history.some(old => old.id === x.id))).toEqual(history);
    const latest = saved.contracts.filter(x => x.contract_id === original.contract_id).sort((a, b) => b.revision - a.revision)[0]!;
    expect(latest.revision).toBe(original.revision + 2);
    expect(latest.client_id).toBe(original.client_id);
    expect(latest.document).toEqual(commercialDocument);
    expect(latest.rules).toEqual({ ...rules, proceedLimit: { pence: 33307, currency: 'GBP' } });
    expect((await storedVersions()).slice(0, previousRows.length)).toEqual(previousRows);
    // Check the persisted admin view on desktop and phone, including the long source IDs.
    for (const details of await page.getByTestId('contract-version').locator('details').all()) {
      if (await details.getAttribute('open') === null) await details.locator('summary').click();
      await expect(details).toHaveAttribute('open', '');
    }
    await expectAdminFitsViewport(page);
    // Starter orders are new identities, so they must pin the revised contract and retain its rates.
    await page.goto('/contractor/work-orders');
    await page.getByLabel(/Starter orders/).check();
    await button(page, 'Import selected file').click();
    await expect(page.getByTestId('import-counts')).toHaveText('5 created · 0 revised · 0 unchanged · 0 refused (of 5 rows)');
    const priced = (await db.query(`SELECT w.contract_version_id,r.sor_version_id,
      r.adjustment_numerator::text numerator,r.adjustment_denominator::text denominator,
      l.sor_code,l.rate_pence::text rate,l.net_pence::text net
      FROM app.work_order w JOIN app.work_order_revision r ON (r.tenant_id,r.work_order_id)=(w.tenant_id,w.id)
      JOIN app.work_order_line l ON (l.tenant_id,l.revision_id)=(r.tenant_id,r.id)
      WHERE w.tenant_id=$1 AND w.reference='WO-DEMO-0001' AND l.sor_code='REPAIR-DOOR'`, [current.tenantId])).rows;
    expect(priced).toEqual([{ contract_version_id: latest.id, sor_version_id: commercialDocument.sorVersionIds[0], numerator: '17', denominator: '200', sor_code: 'REPAIR-DOOR', rate: '10000', net: '10850' }]);
    expect(await effects()).toEqual(beforeEffects);
    expect((await storedVersions()).slice(0, previousRows.length)).toEqual(previousRows);
    expect((await workspace(page)).realExternalActions).toBe(0);
    // Existing origin, tenant and stale-revision refusals remain authoritative.
    const stale = await revise(page, current, fields);
    expect(stale.status()).toBe(409);expect((await stale.json()).code).toBe('STALE_REVISION');
    expect((await page.request.get(`/api/contractor?tenantId=${crypto.randomUUID()}`)).status()).toBe(404);
    expect((await page.request.post('/api/contractor', { data: {} })).status()).toBe(403);
    expect((await page.request.post('/api/contractor/work-order-imports', { headers: { origin: base }, data: { version: 'work-order-import-request.v1', environment: 'synthetic_demo', commandId: crypto.randomUUID(), source: { kind: 'csv', name: 'mine.csv', csv: 'version\r\n' } } })).status()).toBe(403);
    expect((await workspace(page)).contracts).toEqual(saved.contracts);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally { await db.end(); }
});
