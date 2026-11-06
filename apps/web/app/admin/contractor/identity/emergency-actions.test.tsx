import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EmergencyActions } from './emergency-actions';

const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock('react', async original => ({
 ...await original<typeof import('react')>(),
 useState: () => [state.values.shift(), vi.fn()],
 useEffect: () => undefined,
}));
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

it.each(['', 'Checking emergency action…', 'request recorded.', 'Emergency action refused.'])(
 'keeps action status unique while notices are unavailable: %s', status => {
  // Action fields, busy flag, action status, refresh revision, then the notice projection.
  state.values = ['', '', '', '', false, status, 0, null];
  const html = renderToStaticMarkup(<EmergencyActions tenantId="fictional-tenant" csrfToken="fictional-csrf" />);
  expect(html.match(/role="status"/g) ?? []).toHaveLength(status ? 1 : 0);
  if (status) expect(html).toContain(`<p role="status">${status}</p>`);
  expect(html).toContain('<p role="alert">Emergency access notices are unavailable for this session. An owner must check the security audit.</p>');
 },
);
