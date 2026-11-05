import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'job' }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@jobguard/api/evidence-bundle-contracts', async () => await import('../../../../../../api/src/evidence-bundle.contracts.js'));
import Page from './page';
afterEach(() => vi.unstubAllGlobals());
it('shows practice limits without fetching or storing anything during render', () => {
  vi.stubGlobal('React', React); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const html = renderToStaticMarkup(<Page/>);
  expect(html).toContain('Practice: contractor evidence bundle check');
  expect(html).toContain('not proof of workmanship or customer agreement');
  expect(html).toContain('Checking stores nothing'); expect(fetch).not.toHaveBeenCalled();
});
