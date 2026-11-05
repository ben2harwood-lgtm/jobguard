import "server-only";
import { InterimDraftApplication } from "@jobguard/api/workspace";
import { InterimDraftRepository, InterimDraftRepositoryError } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export function interimDraftApplication() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new InterimDraftRepositoryError("DARK");
  return new InterimDraftApplication(identityApplication(), new InterimDraftRepository(syntheticPool()));
}
