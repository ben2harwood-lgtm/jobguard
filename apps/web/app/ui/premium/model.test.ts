import { describe, expect, it } from 'vitest';
import { createDesignExtra, emptyDraft, parsePounds, restoreDesign, seedExtras, transition } from './model';
import { screens, groups, states } from './catalog';

describe('isolated UI design model', () => {
  it('records work as unpriced, without making a server fact', () => {
    const extra = createDesignExtra({ job: 'WO-1042', description: 'Pipe', note: 'Outside the order', photo: true, resident: true }, 'EX-TEST');
    expect(extra).toMatchObject({ pence: null, state: 'logged', source: 'design', origin: 'site' });
    expect(() => createDesignExtra(emptyDraft(), 'EX-BAD')).toThrow();
  });
  it('requires the right role and current revision', () => {
    const extra = seedExtras()[0]!;
    expect(() => transition(extra, 'price', 'operative', extra.revision, '10')).toThrow();
    expect(() => transition(extra, 'price', 'surveyor', extra.revision + 1, '10')).toThrow();
    expect(transition(extra, 'price', 'surveyor', extra.revision, '123.45').pence).toBe(12345);
  });
  it('does not turn final approval into a bill or payment', () => {
    let extra = seedExtras()[0]!;
    extra = transition(extra, 'price', 'surveyor', extra.revision, '185.50');
    extra = transition(extra, 'submit', 'supervisor', extra.revision);
    extra = transition(extra, 'approve', 'supervisor', extra.revision);
    extra = transition(extra, 'approve', 'client', extra.revision);
    expect(extra.state).toBe('approved');
    expect(extra.history.at(-1)).toMatch(/no billing or payment/);
  });
  it('rejects malformed storage and keeps the complete screen inventory', () => {
    expect(restoreDesign('{bad')).toBeNull();
    expect(restoreDesign(JSON.stringify([{ ...seedExtras()[0]!, source: 'server' }]))).toBeNull();
    expect(screens).toHaveLength(143);
    expect(new Set(screens.map(s => s.id)).size).toBe(143);
    expect(groups).toHaveLength(14);
    expect(states).toHaveLength(15);
  });
  it.each(['1.234', '-1', '1e2', '0', '01', '£5', '999999999', '1,000', 'NaN', 'Infinity', ''])('rejects invalid money %s', value => {
    expect(() => parsePounds(value)).toThrow();
  });
});
