import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

const migrations = new URL('../migrations/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Compare the entire latest-event read, including its job scope and ordering, not just the unlink clause.
function latestEventRead(source: string): string {
  const reads = source.replace(/--[^\n]*/gu, '').match(/SELECT e\.kind FROM app\.extra_event e\b[\s\S]*?LIMIT 1/gu);
  expect(reads).toHaveLength(1);
  return reads![0]!
    .replace(/\b[oq]\.(tenant_id|job_id|variation_id)\b/gu, 'outer.$1')
    .replace(/\bp_tenant\b/gu, 'outer.tenant_id')
    .replace(/\bp_job\b/gu, 'outer.job_id')
    .replace(/\bp_variation\b/gu, 'outer.variation_id')
    .replace(/\s+/gu, '');
}

it('keeps the latest SQL routine and both readers in parity for exact-link unlink reversals', () => {
  const definitions = readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()
    .map(name => ({ name, sql: readFileSync(new URL(name, migrations), 'utf8') }))
    .filter(({ sql }) => /CREATE (?:OR REPLACE )?FUNCTION app\.xa_latest_kind\(/u.test(sql));
  const latest = definitions.at(-1)!;
  expect(latest.name).toBe('0622_extra_duplicate_relink.sql');
  const routine = latest.sql.match(/CREATE (?:OR REPLACE )?FUNCTION app\.xa_latest_kind\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/u);
  expect(routine).not.toBeNull();
  const expected = latestEventRead(routine![1]!);
  expect(latestEventRead(read('../src/evidence-bundle-sources.ts'))).toBe(expected);
  expect(latestEventRead(read('../src/northside-demo.ts'))).toBe(expected);
});
