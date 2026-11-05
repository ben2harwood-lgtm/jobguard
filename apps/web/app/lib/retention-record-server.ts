import "server-only";
import { RetentionRecordApplication } from "@jobguard/api/workspace";
import { RetentionRecordRepository, RetentionRecordRepositoryError } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export function retentionRecordApplication() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new RetentionRecordRepositoryError("RETENTION_DARK");
  return new RetentionRecordApplication(identityApplication(), new RetentionRecordRepository(syntheticPool()));
}
