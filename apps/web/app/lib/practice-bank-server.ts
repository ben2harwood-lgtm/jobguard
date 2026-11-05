import "server-only";
import { PracticeBankApplication, type PracticeBankMemory } from "@jobguard/api/workspace";
import { AisError, DarkAisRepository, FakeTrueLayerAisAdapter, SyntheticAisTokenVault, type AisPage } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";

// Deliberately ephemeral. Restarting never restores credentials or consents.
const memory: PracticeBankMemory = { pending: new Map(), adapter: new FakeTrueLayerAisAdapter(), vault: new SyntheticAisTokenVault(),
  pages: new Map<string, AisPage>([["first", { version: "ais-page.v1", nextCursor: null,
    observations: (["pending", "settled", "reversed"] as const).map((status, index) => ({
      version: "ais-observation.v1", accountRef: "fake_practice_account", movementRef: `fake_practice_${status}`,
      providerRef: `fake_practice_provider_${status}`, revision: 1, status,
      amount: { pence: [12500, 32000, -4000][index]!, currency: "GBP" }, bookedOn: "2026-10-02",
    })),
  }]]),
};
export function practiceBankApplication() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new AisError("AIS_DARK_ONLY");
  return new PracticeBankApplication(identityApplication(), new DarkAisRepository(syntheticPool(), memory.adapter, memory.vault), memory);
}
