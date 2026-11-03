import type { Pool } from "pg";
import { PaymentFeeCollectionRepository, PaymentFeeCollectionSourceError, type VerifiedTenantContext } from "@jobguard/db";
import type { AuthProvider } from "../auth/auth-provider.js";
import { DarkFeeCollectionExecutor, type CollectionRail } from "./executor.js";
import { FeeCollectionError, type ReservationStore } from "./contracts.js";
import { pauseSuccessFee } from "./success-fee-direct-debit.js";
/** Concrete MON-4B composition: every success-fee read uses real MON-4A rows.
 * ownerPool is an explicitly supplied owner connection, never runtime credentials.
 * context/digest come unchanged from PracticeAccess; SQL reauthenticates on each read.
 * The reservation store remains the shared card/DD store, not a per-rail book.
 * No route, provider registration or standing-authority writer is enabled. */
export function createSuccessFeeDirectDebitExecutor(input: {
  ownerPool: Pool; context: VerifiedTenantContext; digest: string; store: ReservationStore;
  rails: readonly CollectionRail[]; sessions: Pick<AuthProvider, "authenticate" | "findMembership">;
  now?: () => Date;
}) {
  const repository = new PaymentFeeCollectionRepository(input.ownerPool);
  const store: ReservationStore = {
    async transaction(tenantId, work) {
      if (tenantId !== input.context.tenantId) throw new FeeCollectionError("COLLECTION_REFUSED");
      try {
        return await input.store.transaction(tenantId, (book, sources) =>
          repository.withReader(input.context, input.digest, successFee => work(book, { ...sources, successFee })));
      } catch (error) {
        if (error instanceof PaymentFeeCollectionSourceError) return pauseSuccessFee(error.reason);
        throw error;
      }
    },
  };
  return new DarkFeeCollectionExecutor(store, input.rails, input.now, input.sessions);
}
