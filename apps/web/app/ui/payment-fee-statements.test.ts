import { expect,it } from "vitest";
import { paymentFeeDisplayPence } from "./payment-fee-statements";
it("shows the statement principal and retained money using exact half-even at the display boundary",()=>{
 expect(paymentFeeDisplayPence({numerator:"80000",denominator:"1"})).toBe(80000);
 expect(paymentFeeDisplayPence({numerator:"80000",denominator:"1"},8000)).toBe(72000);
 // Subtract before rounding: half-even is not invariant under odd integer shifts.
 expect(paymentFeeDisplayPence({numerator:"11",denominator:"2"})).toBe(6);
 expect(paymentFeeDisplayPence({numerator:"11",denominator:"2"},1)).toBe(4);
});
it("never converts huge exact denominators to floating-point Infinity",()=>{
 const d=10n**400n;
 expect(paymentFeeDisplayPence({numerator:(80000n*d).toString(),denominator:d.toString()})).toBe(80000);
 expect(paymentFeeDisplayPence({numerator:(80000n*d+d/2n).toString(),denominator:d.toString()},1)).toBe(80000);
});
