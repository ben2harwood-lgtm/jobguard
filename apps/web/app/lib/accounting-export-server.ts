import "server-only";
import { AccountingExportApplication } from "@jobguard/api/accounting-export";
import { AccountingExportRepository } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
export function accountingExportApplication() {
  return new AccountingExportApplication(identityApplication(), new AccountingExportRepository(syntheticPool()));
}
