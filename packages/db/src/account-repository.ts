import { eq } from "drizzle-orm";
import { accounts, type Account } from "./schema.js";
import type { TenantTransaction } from "./tenant-context.js";

/** Repository queries intentionally rely on RLS as a second authorization layer. */
export async function listAccounts(database: TenantTransaction): Promise<Account[]> {
  return database.select().from(accounts);
}

export async function findAccountById(
  database: TenantTransaction,
  accountId: string,
): Promise<Account | undefined> {
  const rows = await database.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  return rows[0];
}
