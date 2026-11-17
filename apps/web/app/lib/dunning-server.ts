import "server-only";
import { DunningApplication } from "@jobguard/api/workspace";
import { DunningError } from "@jobguard/core";
import { DunningRepository } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export function dunningApplication() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new DunningError("DUNNING_DARK");
  return new DunningApplication(identityApplication(), new DunningRepository(syntheticPool()));
}
