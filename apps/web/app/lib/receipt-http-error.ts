export function receiptHttpError(error:unknown,writing:boolean):{status:number;code:string} {
 const value=error instanceof Error?error:null;
 const message=value?.message;
 if(value?.name==="SyntaxError")return {status:400,code:"INVALID_JSON"};
 if(value?.name==="ZodError")return {status:400,code:"INVALID_RECEIPT_COMMAND"};
 if(message==="FORBIDDEN")return {status:403,code:"FORBIDDEN"};
 if(message==="INVOICE_NOT_FOUND"||message==="PAYMENT_NOT_FOUND")return {status:404,code:message};
 if(message==="IDEMPOTENCY_PAYLOAD_CONFLICT"||message==="PAYMENT_ALREADY_REVERSED")return {status:409,code:message};
 if(message==="INVALID_RECEIPT"||message==="INVALID_REVERSAL")return {status:400,code:message};
 if(message==="RECEIPT_TOTAL_LIMIT")return {status:422,code:message};
 // A transport/database error is not proof that a write rolled back. Never
 // leak SQL, schema details, connection strings or unvalidated messages.
 return {status:503,code:writing?"RECEIPT_OUTCOME_UNKNOWN":"RECEIPT_READ_UNAVAILABLE"};
}
