// Shared firm A/B check for every FL slice. Firm A is the seeded builder, firm B the second builder.
// Both practice sessions share one backing tenant, so only v2_practice_firm keeps them apart.

/** The distinct key values (job ids, or the parent key for an indirect table) a session can read. */
async function visibleKeys({ runtime, withTenant }, context, table, key) {
  const { rows } = await withTenant(runtime, context, db => db.$client.query(
    `SELECT DISTINCT ${key}::text AS key FROM ${table}`));
  return new Set(rows.map(row => row.key));
}

/**
 * One test per table family. Positive control first: firm A must read at least one row
 * before firm B's zero counts. A table with no firm A row is listed as "policy present,
 * no row proof"; the guard test is then its only proof.
 * families: { familyName: [[table, keyColumn], ...] }
 */
export function registerFirmChecks(helpers, slice, families) {
  const { test, assert, contexts } = helpers;
  const unproven = [];
  for (const [family, tables] of Object.entries(families)) {
    test(`${slice} firm check: ${family}`, async t => {
      const { firmA, firmB, firmBReal } = await contexts();
      assert.equal(firmA.tenantId, firmB.tenantId, "both firms' practice sessions share one backing tenant");
      for (const [table, key] of tables) {
        const own = await visibleKeys(helpers, firmA, table, key);
        if (own.size === 0) {
          unproven.push(table);
          t.diagnostic(`policy present, no row proof: ${table}`);
          continue;
        }
        for (const [name, other] of [["firm B", firmB], ["firm B's real company", firmBReal]]) {
          const seen = await visibleKeys(helpers, other, table, key);
          const leaked = [...own].filter(value => seen.has(value));
          assert.deepEqual(leaked, [], `${name} reads firm A's ${table} rows`);
        }
      }
    });
  }
  return unproven;
}
