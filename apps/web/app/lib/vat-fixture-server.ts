import "server-only";
import { VatFixtureApplication } from "@jobguard/api/workspace";
import { VatFixtureRepository, VatFixtureRepositoryError } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export function vatFixtureApplication() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new VatFixtureRepositoryError("DISABLED");
  return new VatFixtureApplication(identityApplication(), new VatFixtureRepository(syntheticPool()));
}
