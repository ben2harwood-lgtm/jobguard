import{describe,expect,it}from"vitest";import{receiptHttpError}from"./receipt-http-error";
describe("receipt HTTP errors",()=>{
 it.each([["FORBIDDEN",403],["INVOICE_NOT_FOUND",404],["PAYMENT_NOT_FOUND",404],["IDEMPOTENCY_PAYLOAD_CONFLICT",409],["PAYMENT_ALREADY_REVERSED",409],["INVALID_RECEIPT",400],["INVALID_REVERSAL",400],["RECEIPT_TOTAL_LIMIT",422]] as const)("maps %s without SQL internals",(code,status)=>expect(receiptHttpError(new Error(code),true)).toEqual({status,code}));
 it("never describes an unknown write as definitely absent",()=>{expect(receiptHttpError(new Error("connection reset"),true)).toEqual({status:503,code:"RECEIPT_OUTCOME_UNKNOWN"});expect(receiptHttpError(new Error("connection reset"),false)).toEqual({status:503,code:"RECEIPT_READ_UNAVAILABLE"});});
 it("does not reflect secrets or arbitrary strings",()=>{for(const e of [new Error("postgres://private:secret@host/db"),"secret",null,{message:"secret",code:"42501"}])expect(JSON.stringify(receiptHttpError(e,true))).not.toContain("secret");});
 it("classifies malformed JSON and strict schema errors",()=>{expect(receiptHttpError(new SyntaxError("bad body"),true).status).toBe(400);const error=new Error("private values");error.name="ZodError";expect(receiptHttpError(error,true)).toEqual({status:400,code:"INVALID_RECEIPT_COMMAND"});});
});
