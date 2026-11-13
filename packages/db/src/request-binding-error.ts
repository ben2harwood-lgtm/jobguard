/** Binding refusal carries a public code and no database detail or credential. */
export class RequestBindingRefusedError extends Error {
  readonly code = "FORBIDDEN";
  constructor(readonly sessionKind: "real" | "practice" | "contractor_practice" = "real") { super("FORBIDDEN"); this.name = "RequestBindingRefusedError"; }
}

/** Recognize only the protected bind's refusal, including SQL callers of the meter bridge. */
export function isRequestBindingRefusal(error: unknown): boolean {
  return error instanceof RequestBindingRefusedError || (error instanceof Error
    && "code" in error && error.code === "42501" && error.message === "REQUEST_BINDING_REFUSED");
}

/**
 * Translate only a binding refusal, after withTenant has rolled back and released the client: the failed bind
 * itself, or (LP-6d repair 16, flagged) a guarded routine's own REQUEST_BINDING_REFUSED when the request names
 * an actor or session it is not bound to. Either way the caller sees its usual refusal code, never the binding's.
 */
export function mapRequestBindingRefusal<T>(work: Promise<T>, refusal: () => Error): Promise<T> {
  return work.catch(error => {
    if (isRequestBindingRefusal(error)) throw refusal();
    throw error;
  });
}
