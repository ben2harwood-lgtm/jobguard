import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("0603 preserves the latest M4-13 routines exactly apart from the first-statement database gate", () => {
  const original = readFileSync(new URL("../migrations/0580_subscription_mandate.sql", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0603_subscription_mandate_db_gate.sql", import.meta.url), "utf8");
  const gate = " IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;\n";
  const routines = original.slice(original.indexOf("CREATE FUNCTION app.m413_command("), original.indexOf("ALTER FUNCTION app.m413_command("));
  expect(migration).toBe("BEGIN;\n-- M4-13: synthetic records must remain confined to the demo database.\n" +
    routines.replaceAll("CREATE FUNCTION app.m413_", "CREATE OR REPLACE FUNCTION app.m413_").replaceAll("\nBEGIN\n", "\nBEGIN\n" + gate) + "COMMIT;\n");
  // Body-only replacement changes no catalog attributes tracked by these proofs.
  expect(JSON.parse(readFileSync(new URL("./migration-proofs/0603_subscription_mandate_db_gate.proof.json", import.meta.url), "utf8")))
    .toEqual({ migration: "0603_subscription_mandate_db_gate.sql", lp0: [], upgrade: [], tenancy: [] });
});
