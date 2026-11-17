import type { Pool } from "pg";
import { PaymentFeeCollectionRepository, PaymentFeeCollectionSourceError, type VerifiedTenantContext } from "@jobguard/db";
import type { AuthProvider } from "../auth/auth-provider.js";
import { DarkFeeCollectionExecutor, type CollectionRail } from "./executor.js";
import { FeeCollectionError, type LockedCollectionSources, type ReservationStore } from "./contracts.js";
import { pauseSuccessFee } from "./success-fee-direct-debit.js";
type SuccessFeeReader = NonNullable<LockedCollectionSources["successFee"]>;
/** Concrete MON-4B composition: every success-fee read uses real MON-4A rows.
 * ownerPool is an explicitly supplied owner connection, never runtime credentials.
 * context/digest come unchanged from PracticeAccess; SQL reauthenticates on each read.
 * The reservation store remains the shared card/DD store, not a per-rail book.
 * No route, provider registration or standing-authority writer is enabled. */
export function createSuccessFeeDirectDebitExecutor(context: VerifiedTenantContext, input: {
  ownerPool: Pool; digest: string; store: ReservationStore;
  rails: readonly CollectionRail[]; sessions: Pick<AuthProvider, "authenticate" | "findMembership">;
  now?: () => Date;
}) {
  const repository = new PaymentFeeCollectionRepository(input.ownerPool);
  const store: ReservationStore = {
    async transaction(tenantId, work, providerResult) {
      if (tenantId !== context.tenantId) throw new FeeCollectionError("COLLECTION_REFUSED");
      try {
        return await input.store.transaction(tenantId, async (book, sources) => {
          let finish!: () => void;
          const finished = new Promise<void>(resolve => { finish = resolve; });
          let reader: Promise<SuccessFeeReader> | undefined;
          let closed: Promise<void> | undefined;
          let closeError: { error: unknown } | undefined;
          let workError: { error: unknown } | undefined;
          const successFee: SuccessFeeReader = async (...args) => {
            reader ??= new Promise<SuccessFeeReader>((resolve, reject) => {
              // Open once, only on demand. Retain the SQL source/authorization
              // locks until work settles, rather than just until this read returns.
              closed = repository.withReader(context, input.digest, async read => {
                resolve(read);
                await finished;
                if (workError) throw workError.error;
              }).catch(error => { reject(error); closeError = { error }; });
            });
            return (await reader)(...args);
          };
          try {
            return await work(book, { ...sources, successFee });
          } catch (error) {
            workError = { error };
            throw error;
          } finally {
            finish();
            await closed;
            // A reader transaction failure must roll back the reservation too.
            if (closeError) throw closeError.error;
          }
        }, providerResult);
      } catch (error) {
        if (error instanceof PaymentFeeCollectionSourceError) return pauseSuccessFee(error.reason);
        throw error;
      }
    },
  };
  return new DarkFeeCollectionExecutor(store, input.rails, input.now, input.sessions);
}
