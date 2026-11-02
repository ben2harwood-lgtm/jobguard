/** Error contract only; worker persistence is implemented in the permitted worker module. */
export const finalCheckPersistenceErrorCodes=["INVALID_FINAL_CHECK_INPUT","FINAL_ACCOUNT_LOCK_REQUIRED","FINAL_CHECK_NOT_COMPLETE","FINAL_CHECK_FAILED","FINAL_CHECK_INVENTORY_INCOMPLETE","FINAL_CHECK_INPUT_UNAVAILABLE","FINAL_CHECK_INPUT_MISMATCH","FINAL_CHECK_DETECTION_REQUIRED","FINAL_CHECK_SIGNAL_BINDING_INVALID","FINAL_CHECK_LOCK_BINDING_INVALID","FINAL_CHECK_SOURCE_IDENTITY_CHANGED","FINAL_CHECK_RESULT_UNAVAILABLE","IDEMPOTENCY_PAYLOAD_CONFLICT","FORBIDDEN","DISCLOSURE_TERMS_NOT_ACCEPTED"] as const;
export type FinalCheckPersistenceErrorCode=typeof finalCheckPersistenceErrorCodes[number];
export class FinalCheckPersistenceError extends Error {
 constructor(readonly code:FinalCheckPersistenceErrorCode){super(code);this.name="FinalCheckPersistenceError";}
}
export type FinalCheckManifestView={id:string;lockId:string;cutoff:string;sourceCount:number;inventoryHash:string;detectorVersion:string;reconciliationVersion:string};
