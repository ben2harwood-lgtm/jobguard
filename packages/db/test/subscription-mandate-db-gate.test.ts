import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("M4-13 database gate preserves the latest M4-13 routines exactly apart from the first-statement database gate", () => {
  const original = readFileSync(new URL("../migrations/0561_subscription_mandate.sql", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0562_subscription_mandate_db_gate.sql", import.meta.url), "utf8");
  const gate = " IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;\n";
  const routines = original.slice(original.indexOf("CREATE FUNCTION app.m413_command("), original.indexOf("ALTER FUNCTION app.m413_command("));
  expect(migration).toBe("BEGIN;\n-- M4-13: synthetic records must remain confined to the demo database.\n" +
    routines.replaceAll("CREATE FUNCTION app.m413_", "CREATE OR REPLACE FUNCTION app.m413_").replaceAll("\nBEGIN\n", "\nBEGIN\n" + gate) + "COMMIT;\n");
  // Body-only replacement changes no catalog attributes tracked by these proofs.
  expect(JSON.parse(readFileSync(new URL("./migration-proofs/0562_subscription_mandate_db_gate.proof.json", import.meta.url), "utf8")))
    .toEqual({ migration: "0562_subscription_mandate_db_gate.sql", lp0: [], upgrade: [], tenancy: [] });
});

it("keeps M4-13 audit writes on main's sealed helper and registers both tables for exact tenancy checks", () => {
  const migration = readFileSync(new URL("../migrations/0562_subscription_mandate_db_gate.sql", import.meta.url), "utf8");
  const audit = readFileSync(new URL("../migrations/0520_lp4_database_audit.sql", import.meta.url), "utf8")
    .split("CREATE OR REPLACE FUNCTION app.mon2_audit(")[1]!.split("END $$;")[0]!;
  expect(migration).toContain("PERFORM app.mon2_audit(");
  expect(migration).not.toMatch(/INSERT\s+INTO\s+app\.audit_event|app\.lock_audit_head/iu);
  expect(audit).toContain("app.lp4_seal_audit(");
  expect(audit).not.toMatch(/INSERT\s+INTO\s+app\.audit_event|app\.lock_audit_head/iu);
  const proof = JSON.parse(readFileSync(new URL("./migration-proofs/0561_subscription_mandate.proof.json", import.meta.url), "utf8"));
  expect(proof.tenancy).toEqual(["subscription_mandate_event", "subscription_terms_version"].map(relname => ({
    relname, before: null, after: { relrowsecurity: true, relforcerowsecurity: true, guarded: true, owner: "jobguard_migration" },
  })));
});
