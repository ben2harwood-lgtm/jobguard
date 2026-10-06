import { describe, expect, it } from "vitest";
import { allocateReceiptToLines, receiptAllocationV1, type ReceiptAllocationInput } from "./receipt-allocation.js";
import { addExactPence, calculateCumulativeFee, exactPence, MAX_ALLOCATION_WORKING_DIGITS, MAX_EXACT_PENCE_DIGITS, serializeExactPence, sumExactPence } from "./cumulative-fee.js";
const before = "2026-09-01T00:00:00Z", at = "2026-09-30T00:00:00Z", after = "2026-10-01T00:00:00Z";
const p = (value: number) => ({numerator:String(value),denominator:"1"});
const line = (id:string,net:number,gross:number,outstanding=gross,existedAt=before,invoiceId="blended") => ({id,invoiceId,netPence:net,grossPence:gross,outstandingGross:p(outstanding),existedAt});
const input = (gross:number,lines:ReceiptAllocationInput["lines"]):ReceiptAllocationInput => ({version:"receipt-allocation.v1",sourceRef:"fixture://remittance",receiptGross:p(gross),effectiveAt:at,direction:"receipt",invoiceId:"blended",separateInvoiceId:null,explicit:null,lines});
const net = (raw:ReceiptAllocationInput,id="catch") => allocateReceiptToLines(raw).find(l=>l.lineId===id)?.net ?? exactPence(0n);
const fee = (principal: ReturnType<typeof exactPence>) => calculateCumulativeFee({version:"cumulative-fee.v1",rate:{version:"fee-rate.v1",policyVersion:"v3",numerator:"10",denominator:"100"},cumulativeQualifyingPrincipal:serializeExactPence(principal),priorNetPostedPence:0,priorPolicyVersion:"v3",compensatesDerivationId:null}).cumulativeFee.pence;
describe("receipt hierarchy and exact line allocation",()=>{
 it("F4/F4b keeps fractional pence until cumulative rounding",()=>{
  const lines=[line("baseline",3360000,4032000),line("catch",80000,96000)];
  const first=net(input(2400000,lines));expect(first).toEqual(exactPence(2000000n,43n));expect(fee(first)).toBe(4651);
  const second=net(input(1728000,lines));expect(fee(addExactPence(first,second))).toBe(8000);
  expect(fee(net(input(4128000,lines)))).toBe(8000);
 });
 it("F5 excludes pre-existing deposits from later catches",()=>{
  const lines=[line("baseline",3360000,4032000),line("catch",80000,96000,96000,after)];
  expect(net(input(1200000,lines)).numerator).toBe(0n);
  expect(fee(net(input(1464000,[line("baseline",3360000,4032000,2832000),line("catch",80000,96000)])))).toBe(4000);
 });
 it("F6 explicit allocation outranks the blended invoice and preserves its source",()=>{
  const raw={...input(2400000,[line("baseline",3360000,4032000),line("catch",80000,96000)]),explicit:[{lineId:"baseline",gross:p(2400000)}]};
  expect(fee(net(raw))).toBe(0);expect(allocateReceiptToLines(raw)[0]).toMatchObject({rule:"explicit",sourceRef:"fixture://remittance"});
 });
 it("F7 ignores the unpaid main invoice for a separate catch invoice",()=>{
  const raw={...input(96000,[line("catch",80000,96000,96000,before,"catch-invoice"),line("baseline",3360000,4032000)]),invoiceId:"catch-invoice",separateInvoiceId:"catch-invoice"};
  expect(fee(net(raw))).toBe(8000);expect(allocateReceiptToLines(raw)).toHaveLength(1);
  expect(allocateReceiptToLines(raw)[0]?.rule).toBe("separate_invoice");
 });
 it("ENT-F2 conserves gross including non-fee order lines and each own tax ratio",()=>{
  const raw=input(50000,[line("order",100000,120000),line("catch",24000,28800)]);
  expect(net(raw)).toEqual(exactPence(250000n,31n));expect(fee(net(raw))).toBe(806);
  expect(allocateReceiptToLines(raw).reduce((sum,l)=>addExactPence(sum,l.gross),exactPence(0n))).toEqual(exactPence(50000n));
  expect(net(input(60,[line("zero-VAT",100,100),line("catch",100,120)]))).toEqual(exactPence(300n,11n));
 });
 it("refunds apply the same hierarchy with negative exact values",()=>{
  const raw={...input(24000,[line("catch",80000,96000)]),direction:"reversal" as const,explicit:[{lineId:"catch",gross:p(24000)}]};
  expect(net(raw)).toEqual(exactPence(-20000n));
  expect(allocateReceiptToLines({...raw,explicit:null})[0]?.net).toEqual(exactPence(-20000n));
 });
 it("split receipts conserve exact gross/net with generated ratios",()=>{
  for(let i=1;i<=300;i++) {
   const lines=[line("base",i*10,i*12),line("catch",i*20,i*24)];
   const whole=input(i*18,lines),a=input(i*7,lines),b=input(i*11,lines);
   expect(addExactPence(net(a),net(b))).toEqual(net(whole));
   expect(fee(addExactPence(net(a),net(b)))).toBe(fee(net(whole)));
  }
 });
 it("rejects over-allocation, unknown/duplicate/late explicit targets and invalid invoices",()=>{
  const base=input(120,[line("catch",100,120)]);
  for(const raw of [ {...base,receiptGross:p(121)}, {...base,lines:[]}, {...base,separateInvoiceId:"other"},
   {...base,explicit:[]}, {...base,explicit:[{lineId:"other",gross:p(120)}]},
   {...base,explicit:[{lineId:"catch",gross:p(60)},{lineId:"catch",gross:p(60)}]},
   {...base,lines:[line("catch",100,120,120,after)],explicit:[{lineId:"catch",gross:p(120)}]},
   {...base,lines:[...base.lines,...base.lines]}, {...base,lines:[line("catch",121,120)]},
   {...base,receiptGross:p(-1)}, {...base,lines:[line("catch",100,120,-1)]},
  ]) expect(()=>allocateReceiptToLines(raw)).toThrow("INVALID_ALLOCATION");
  expect(allocateReceiptToLines(input(0,[]))).toEqual([]);
 });
});

// Round 2 (independent check on 71ee571): the cutoff is an exact-instant comparison, not a millisecond one.
describe("effective-time cutoff compares exact instants",()=>{
 const baseLines=(existedAt:string)=>[line("baseline",100,120),line("late",100,120,120,existedAt)];
 const at = (effectiveAt:string,existedAt:string,gross=60) => ({...input(gross,baseLines(existedAt)),effectiveAt});
 const ids = (raw:ReceiptAllocationInput) => allocateReceiptToLines(raw).map(l=>l.lineId);
 it("excludes a line created later within the same millisecond, for pro-rata and explicit allocation",()=>{
  const raw=at("2026-09-30T00:00:00.000100Z","2026-09-30T00:00:00.000900Z");
  expect(ids(raw)).toEqual(["baseline"]);
  expect(allocateReceiptToLines(raw)[0]?.gross).toEqual(exactPence(60n));
  expect(()=>allocateReceiptToLines({...raw,receiptGross:p(120),explicit:[{lineId:"late",gross:p(120)}]})).toThrow("INVALID_ALLOCATION");
  expect(ids({...raw,receiptGross:p(60),explicit:[{lineId:"baseline",gross:p(60)}]})).toEqual(["baseline"]);
 });
 it("includes a line that existed at the same instant however the fraction is written",()=>{
  for(const [effective,existed] of [
   ["2026-09-30T00:00:00.000100Z","2026-09-30T00:00:00.000100Z"],["2026-09-30T00:00:00.0001Z","2026-09-30T00:00:00.000100Z"],
   ["2026-09-30T00:00:00.1Z","2026-09-30T00:00:00.100000Z"],["2026-09-30T00:00:00Z","2026-09-30T00:00:00.000Z"],
   ["2026-09-30T00:00Z","2026-09-30T00:00:00Z"],
  ] as const) expect(ids(at(effective,existed))).toEqual(["baseline","late"]);
 });
 it("orders instants down to nanoseconds, and a later receipt includes an earlier line",()=>{
  expect(ids(at("2026-09-30T00:00:00.000000000Z","2026-09-30T00:00:00.000000001Z"))).toEqual(["baseline"]);
  expect(ids(at("2026-09-30T00:00:00.000000001Z","2026-09-30T00:00:00.000000000Z"))).toEqual(["baseline","late"]);
  expect(ids(at("2026-09-30T00:00:00.999999999Z","2026-09-30T00:00:01Z"))).toEqual(["baseline"]);
 });
 it("applies timezone offsets at full precision",()=>{
  expect(ids(at("2026-09-30T00:00:00.000500Z","2026-09-30T01:00:00.000500+01:00"))).toEqual(["baseline","late"]);
  expect(ids(at("2026-09-30T00:00:00.000500Z","2026-09-30T01:00:00.000600+01:00"))).toEqual(["baseline"]);
  expect(ids(at("2026-09-30T00:00:00.000500Z","2026-09-30T01:00:00.000500+0100"))).toEqual(["baseline","late"]);
  expect(ids(at("2026-09-30T00:00:00.000100Z","2026-09-29T19:00:00.000100-05:00"))).toEqual(["baseline","late"]);
  expect(ids(at("2026-09-30T00:00:00.000100Z","2026-09-29T19:00:00.000200-05:00"))).toEqual(["baseline"]);
  expect(ids(at("2026-09-30T05:30:00.000100+05:30","2026-09-30T00:00:00.000100Z"))).toEqual(["baseline","late"]);
 });
 it("orders across month, leap-day and year boundaries",()=>{
  expect(ids(at("2028-03-01T00:00:00Z","2028-02-29T23:59:59.999999Z"))).toEqual(["baseline","late"]);
  expect(ids(at("2028-02-29T23:59:59.999999Z","2028-03-01T00:00:00Z"))).toEqual(["baseline"]);
  expect(ids(at("2027-01-01T00:00:00Z","2026-12-31T23:59:59.9999999Z"))).toEqual(["baseline","late"]);
  expect(ids(at("2026-12-31T23:59:59.9999999Z","2027-01-01T00:00:00Z"))).toEqual(["baseline"]);
 });
});

// Round 2: allocation totals must be able to enter the fee kernel at the sizes the allocator supports.
describe("allocator totals enter the fee kernel",()=>{
 const sum = (items:readonly {net:ReturnType<typeof exactPence>}[]) => items.reduce((total,a)=>addExactPence(total,a.net),exactPence(0n));
 it("a 150-line invoice with penny-rounded VAT and one penny already allocated per line yields the once-rounded fee",()=>{
  const lines=Array.from({length:150},(_,i)=>{const n=101+i,g=n+Math.round(n/5);return line(`line-${i}`,n,g,g-1);});
  const total=sum(allocateReceiptToLines(input(100,lines)));
  expect(total.numerator.toString().length).toBeGreaterThan(100);
  expect(fee(total)).toBe(8);
 });
 // Distinct 12-digit amounts make the aggregate denominator the full product of the line amounts (about 12 digits a line).
 const wide=(count:number)=>{
  let seed=20261004;const next=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0);
  return Array.from({length:count},(_,i)=>{const g=900_000_000_000+next()%99_000_000_000;return line(`wide-${i}`,Math.floor(g/1.2),g,g-1);});
 };
 // Independent of the module: one exact fraction over the product of the line denominators, rounded half-even once.
 const independentFee=(receipt:bigint,lines:ReturnType<typeof wide>)=>{
  const total=lines.reduce((t,l)=>t+BigInt(l.outstandingGross.numerator),0n);
  let numerator=0n,denominator=1n;
  for(const l of lines){const n=receipt*BigInt(l.outstandingGross.numerator)*BigInt(l.netPence),d=total*BigInt(l.grossPence);numerator=numerator*d+n*denominator;denominator*=d;}
  const scaled=numerator,divisor=denominator*10n,quotient=scaled/divisor,twice=(scaled%divisor)*2n;
  return Number(twice>divisor||(twice===divisor&&quotient%2n===1n)?quotient+1n:quotient);
 };
 it.each([1000,2000])("%i lines of distinct 12-digit amounts aggregate exactly, within the contract size, and round once",(count)=>{
  const lines=wide(count),out=allocateReceiptToLines(input(1_000_000,lines));
  const folded=out.reduce((t,a)=>addExactPence(t,a.net),exactPence(0n)),summed=sumExactPence(out.map(a=>a.net));
  expect(summed).toEqual(folded);
  expect(summed).toEqual(exactPence(summed.numerator,summed.denominator));
  expect(summed.denominator.toString().length).toBeGreaterThan(count*7);
  expect(summed.denominator.toString().length).toBeLessThanOrEqual(MAX_EXACT_PENCE_DIGITS);
  expect(fee(summed)).toBe(independentFee(1_000_000n,lines));
 });
 it("whole-penny pro-rata receipts against updated balances aggregate to one allocation's size however many arrive",()=>{
  const lines=wide(60);let remaining=lines,summed=exactPence(0n);const receipts=[1,250,99_999,7,1_000_003,42,5_000_000,13];
  for(const receipt of receipts){
   const out=allocateReceiptToLines(input(receipt,remaining));
   summed=sumExactPence([summed,...out.map(a=>a.net)]);
   remaining=remaining.map(l=>{const a=out.find(x=>x.lineId===l.id)!;const left=addExactPence(exactPence(BigInt(l.outstandingGross.numerator),BigInt(l.outstandingGross.denominator)),exactPence(-a.gross.numerator,a.gross.denominator));return {...l,outstandingGross:serializeExactPence(left)};});
  }
  const once=sumExactPence(allocateReceiptToLines(input(receipts.reduce((a,b)=>a+b,0),lines)).map(a=>a.net));
  expect(summed).toEqual(once);
  expect(fee(summed)).toBe(independentFee(BigInt(receipts.reduce((a,b)=>a+b,0)),lines));
 });
 it("fails closed, with a typed error, when one allocation's total cannot be represented",()=>{
  // Each balance is 100 pence plus a fraction with its own large denominator, so the balances' total needs both denominators.
  const balance=(digits:bigint,n:bigint)=>{const d=10n**digits+n;return {numerator:String(100n*d+1n),denominator:String(d)};};
  const pair=(digits:bigint)=>[{...line("a",100,120),outstandingGross:balance(digits,1n)},{...line("b",100,120),outstandingGross:balance(digits,3n)}];
  const raw=input(1,pair(59n));
  expect(()=>allocateReceiptToLines(raw)).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines({...raw,receiptGross:p(0)})).toThrow("INVALID_ALLOCATION");
  expect(allocateReceiptToLines(input(1,pair(40n)))).toHaveLength(2);
 });
});

// Round 3 (independent check on 6075710): valid rational totals, balances capped by the original line, validated UTC offsets.
type Fraction = {numerator:string;denominator:string};
const frac = (numerator:bigint,denominator:bigint):Fraction => ({numerator:String(numerator),denominator:String(denominator)});
const withBalance = (id:string,balance:Fraction,net=1,gross=1,existedAt=before,invoiceId="blended") => ({...line(id,net,gross,gross,existedAt,invoiceId),outstandingGross:balance});
const receiptOf = (raw:ReceiptAllocationInput,gross:Fraction):ReceiptAllocationInput => ({...raw,receiptGross:gross});
describe("balances whose exact total reduces to a short value",()=>{
 // d1 and d2 are 61 digits, so the balances' common denominator is 121 digits but their exact total is 2 pence.
 const d1=10n**60n+1n,d2=10n**60n+3n;
 const complement=[frac(1n,d1),frac(d1-1n,d1),frac(1n,d2),frac(d2-1n,d2)];
 const composition=complement.map((balance,i)=>withBalance(`c${i}`,balance));
 const raw=(gross:bigint,lines=composition)=>receiptOf(input(0,lines),frac(gross,1n));
 const grossOf=(out:ReturnType<typeof allocateReceiptToLines>)=>sumExactPence(out.map(a=>a.gross));
 it("pro-rata allocates a 1p receipt across four balances whose exact total is 2p",()=>{
  expect(receiptAllocationV1.safeParse(raw(1n)).success).toBe(true);
  const out=allocateReceiptToLines(raw(1n));
  expect(out.map(a=>a.gross)).toEqual([exactPence(1n,2n*d1),exactPence(d1-1n,2n*d1),exactPence(1n,2n*d2),exactPence(d2-1n,2n*d2)]);
  expect(grossOf(out)).toEqual(exactPence(1n));
  expect(sumExactPence(out.map(a=>a.net))).toEqual(exactPence(1n));
 });
 it("pro-rata settles the whole total and still rejects an overpayment",()=>{
  const out=allocateReceiptToLines(raw(2n));
  expect(out.map(a=>a.gross)).toEqual(complement.map(c=>exactPence(BigInt(c.numerator),BigInt(c.denominator))));
  expect(grossOf(out)).toEqual(exactPence(2n));
  expect(()=>allocateReceiptToLines(raw(3n))).toThrow("INVALID_ALLOCATION");
 });
 it("reversal over the same remaining settled balances is the exact negative",()=>{
  const out=allocateReceiptToLines({...raw(1n),direction:"reversal"});
  expect(grossOf(out)).toEqual(exactPence(-1n));
  expect(out.map(a=>a.gross)).toEqual(allocateReceiptToLines(raw(1n)).map(a=>exactPence(-a.gross.numerator,a.gross.denominator)));
 });
 it("explicit allocation accepts such balances as line limits",()=>{
  const shares=complement.map((c,i)=>({lineId:`c${i}`,gross:c}));
  const out=allocateReceiptToLines({...raw(2n),explicit:shares});
  expect(out.map(a=>a.rule)).toEqual(["explicit","explicit","explicit","explicit"]);
  expect(grossOf(out)).toEqual(exactPence(2n));
  expect(()=>allocateReceiptToLines({...raw(3n),explicit:shares})).toThrow("INVALID_ALLOCATION");
 });
 it("explicit shares whose exact total equals the receipt are accepted however long their common denominator",()=>{
  const lines=complement.map((_,i)=>withBalance(`c${i}`,frac(1n,1n)));
  const shares=complement.map((c,i)=>({lineId:`c${i}`,gross:c}));
  const out=allocateReceiptToLines({...raw(2n,lines),explicit:shares});
  expect(grossOf(out)).toEqual(exactPence(2n));
  // the same shares against a receipt that is not their exact total are still incomplete
  expect(()=>allocateReceiptToLines({...raw(1n,lines),explicit:shares})).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines({...raw(3n,lines),explicit:shares})).toThrow("INVALID_ALLOCATION");
 });
 it("an allocation total longer than the result limit still fails closed, whatever the working size",()=>{
  const wide=(n:bigint)=>withBalance(`w${n}`,frac(1n,10n**60n+n));
  const lines=[wide(1n),wide(3n)];  // total = (2*10^60 + 4) / ((10^60+1)(10^60+3)): 121 digits once reduced
  expect(()=>allocateReceiptToLines(raw(1n,lines))).toThrow("INVALID_ALLOCATION");
 });
 // Distinct 100-digit denominators from a generator: every line adds about 100 digits to the common denominator.
 const hundredDigits=(count:number)=>{
  let seed=7;const next=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0);
  return Array.from({length:count},()=>{let digits=String(1+next()%9);for(let i=1;i<100;i++)digits+=String(next()%10);return BigInt(digits)|1n;});
 };
 it("the working size is bounded: more distinct denominators than the documented limit fail closed",()=>{
  const lines=hundredDigits(1_600).map((d,i)=>withBalance(`w${i}`,frac(1n,d)));
  for(const gross of [0n,1n]) expect(()=>allocateReceiptToLines(raw(gross,lines))).toThrow("INVALID_ALLOCATION");
  const shares=lines.slice(0,2).map(l=>({lineId:l.id,gross:l.outstandingGross}));
  expect(()=>allocateReceiptToLines({...raw(1n,lines),explicit:lines.map(l=>({lineId:l.id,gross:l.outstandingGross}))})).toThrow("INVALID_ALLOCATION");
  expect(shares).toHaveLength(2);
  expect(MAX_ALLOCATION_WORKING_DIGITS).toBe(130_000);
 });
 // Independent of the module: sum over the product of the denominators, no reduction anywhere.
 const roundHalfEven=(n:bigint,d:bigint)=>{const q=n/d,twice=(n%d)*2n;return twice>d||(twice===d&&q%2n===1n)?q+1n:q;};
 it("the exact net of many cancelling balances enters the fee kernel at the supported working size",()=>{
  // 300 pairs, balances 1/e and (e-1)/e with a 100-digit e each: the total is 300p and the balances' common denominator
  // about 30,000 digits. Every line has its own 12-digit gross, so the line amounts add their own lcm on top.
  const pairs=300,denominators=hundredDigits(pairs);
  const gross=(k:number,side:number)=>100_000_000_000+4*k+side+1,net=(g:number,per:number)=>Math.floor(g/6)*per;
  const lines=denominators.flatMap((e,k)=>[
   withBalance(`a${k}`,frac(1n,e),net(gross(k,0),5),gross(k,0)),withBalance(`b${k}`,frac(e-1n,e),net(gross(k,2),4),gross(k,2)),
  ]);
  const out=allocateReceiptToLines(raw(7n,lines));
  expect(grossOf(out)).toEqual(exactPence(7n));
  const summed=sumExactPence(out.map(a=>a.net));
  // Independent of the module: one unreduced fraction over the product of every denominator, no reduction anywhere.
  // receipt/total x sum over pairs of  netA/(grossA e) + netB (e-1)/(grossB e)
  let fractionNumerator=0n,fractionDenominator=1n;
  for(const [k,e] of denominators.entries()){
   const a=lines[2*k]!,b=lines[2*k+1]!;
   const numerator=BigInt(a.netPence)*BigInt(b.grossPence)+BigInt(b.netPence)*BigInt(a.grossPence)*(e-1n),denominator=BigInt(a.grossPence)*BigInt(b.grossPence)*e;
   fractionNumerator=fractionNumerator*denominator+numerator*fractionDenominator;fractionDenominator*=denominator;
  }
  const numerator=7n*fractionNumerator,denominator=BigInt(pairs)*fractionDenominator;
  // equal by value (cross-multiplication: reducing a 30,000-digit pair would cost a full-length gcd), and nothing the sum added
  expect(summed.numerator*denominator).toBe(numerator*summed.denominator);
  expect(denominator%summed.denominator).toBe(0n);
  expect(summed.denominator.toString().length).toBeGreaterThan(30_000);
  expect(summed.denominator.toString().length).toBeLessThanOrEqual(MAX_EXACT_PENCE_DIGITS);
  expect(fee(summed)).toBe(Number(roundHalfEven(numerator,denominator*10n)));
 });
});

describe("a line balance can never exceed the line's original gross",()=>{
 const base=input(0,[]);
 const over=(balance:Fraction,gross=120,net=100,id="catch")=>[withBalance(id,balance,net,gross)];
 it("rejects a balance above the original gross for pro-rata, explicit and separate-invoice allocation",()=>{
  const pro=(gross:number,balance:Fraction)=>input(gross,over(balance));
  // 100p net / 120p gross with 240p outstanding would pay out 200p net for a 120p line
  expect(()=>allocateReceiptToLines(pro(240,p(240)))).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines(pro(120,p(240)))).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines(pro(1,p(121)))).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines(pro(0,p(121)))).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines({...pro(240,p(240)),explicit:[{lineId:"catch",gross:p(240)}]})).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines({...pro(120,p(240)),explicit:[{lineId:"catch",gross:p(120)}]})).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines({...pro(120,p(240)),separateInvoiceId:"blended"})).toThrow("INVALID_ALLOCATION");
  expect(receiptAllocationV1.safeParse(pro(120,p(240))).success).toBe(false);
 });
 it("rejects remaining settled balances above the original gross on a reversal",()=>{
  const reversal=(balance:Fraction,gross=120)=>({...input(gross,over(balance)),direction:"reversal" as const});
  expect(()=>allocateReceiptToLines(reversal(p(240),240))).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines(reversal(p(240),120))).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines({...reversal(p(240),120),explicit:[{lineId:"catch",gross:p(120)}]})).toThrow("INVALID_ALLOCATION");
  expect(allocateReceiptToLines({...reversal(p(120),120),explicit:[{lineId:"catch",gross:p(120)}]})[0]?.net).toEqual(exactPence(-100n));
 });
 it("compares exactly: the original gross is allowed, one part in 10^97 more is not",()=>{
  const d=10n**97n+1n,above=frac(120n*d+1n,d),at=frac(120n*d,d),below=frac(120n*d-1n,d);
  expect(()=>allocateReceiptToLines(input(1,over(above)))).toThrow("INVALID_ALLOCATION");
  expect(()=>allocateReceiptToLines({...input(1,over(above)),explicit:[{lineId:"catch",gross:p(1)}]})).toThrow("INVALID_ALLOCATION");
  expect(allocateReceiptToLines(input(120,over(at)))[0]?.gross).toEqual(exactPence(120n));
  expect(allocateReceiptToLines(input(1,over(below)))[0]?.gross).toEqual(exactPence(1n));
  // a fraction written unreduced is compared by value
  expect(allocateReceiptToLines(input(1,over(frac(240n,2n))))[0]?.gross).toEqual(exactPence(1n));
  expect(()=>allocateReceiptToLines(input(1,over(frac(242n,2n))))).toThrow("INVALID_ALLOCATION");
 });
 it("a malformed amount is a typed INVALID_ALLOCATION, never a raw exception from the balance check",()=>{
  const bad:unknown[]=[{numerator:"abc",denominator:"1"},{numerator:"1.5",denominator:"1"},{numerator:"1e5",denominator:"2"},{numerator:"",denominator:"1"},
   {numerator:"1",denominator:"x"},{numerator:"1",denominator:"0"},{numerator:"1",denominator:"-3"},{numerator:"1",denominator:"1.5"},{numerator:"1"+"0".repeat(120),denominator:"1"},
   {numerator:1,denominator:"1"},{numerator:"1"},{numerator:"1",denominator:"1",extra:"x"},"1",null,undefined,7];
  for(const balance of bad) {
   const raw=input(1,[{...line("catch",100,120),outstandingGross:balance as Fraction}]);
   expect(()=>receiptAllocationV1.safeParse(raw)).not.toThrow();
   expect(receiptAllocationV1.safeParse(raw).success).toBe(false);
   expect(()=>allocateReceiptToLines(raw)).toThrow("INVALID_ALLOCATION");
  }
  for(const grossPence of [120.5,Number.POSITIVE_INFINITY,Number.NaN,-1,0,"120",null,2**53]) {
   const raw=input(1,[{...line("catch",100,120),grossPence:grossPence as number}]);
   expect(()=>receiptAllocationV1.safeParse(raw)).not.toThrow();
   expect(()=>allocateReceiptToLines(raw)).toThrow("INVALID_ALLOCATION");
  }
 });
 it("checks every supplied line, including lines the receipt does not reach",()=>{
  const lines=[line("baseline",100,120),withBalance("other",p(500),100,120,before,"other-invoice"),withBalance("later",p(500),100,120,after)];
  expect(()=>allocateReceiptToLines(input(60,lines))).toThrow("INVALID_ALLOCATION");
  expect(allocateReceiptToLines(input(60,[lines[0]!,{...lines[1]!,outstandingGross:p(120)},{...lines[2]!,outstandingGross:p(0)}]))).toHaveLength(1);
  expect(base.lines).toEqual([]);
 });
});

describe("UTC offsets are validated at the schema boundary",()=>{
 const effective="2026-10-02T00:00:00Z";
 const lines=(existedAt:string)=>[line("baseline",100,120),line("late",100,120,120,existedAt)];
 const at=(existedAt:string,gross=60):ReceiptAllocationInput=>({...input(gross,lines(existedAt)),effectiveAt:effective});
 const ids=(raw:ReceiptAllocationInput)=>allocateReceiptToLines(raw).map(l=>l.lineId);
 const malformed=["+99:99","-99:99","+24:00","-24:00","+23:60","-23:60","+00:60","+2400","+9999","+1260","-0060","+30:00","+12:99"];
 it("rejects an out-of-range offset on a line, so it cannot move the line before the receipt",()=>{
  // 2026-10-03T00:00:00+99:99 would read as 2026-09-29T... and be allocated money
  for(const offset of malformed) {
   const raw=at(`2026-10-03T00:00:00${offset}`);
   expect(receiptAllocationV1.safeParse(raw).success).toBe(false);
   expect(()=>allocateReceiptToLines(raw)).toThrow("INVALID_ALLOCATION");
   expect(()=>allocateReceiptToLines({...raw,explicit:[{lineId:"baseline",gross:p(60)}]})).toThrow("INVALID_ALLOCATION");
  }
 });
 it("rejects an out-of-range offset on the receipt time",()=>{
  for(const offset of malformed) {
   const raw={...at("2026-10-01T00:00:00Z"),effectiveAt:`2026-10-02T00:00:00${offset}`};
   expect(receiptAllocationV1.safeParse(raw).success).toBe(false);
   expect(()=>allocateReceiptToLines(raw)).toThrow("INVALID_ALLOCATION");
  }
 });
 it("accepts every offset from -23:59 to +23:59, colon or compact, and applies it exactly",()=>{
  for(const [existed,included] of [
   ["2026-10-03T00:00:00+23:59",false],["2026-10-03T00:00:00+2359",false],["2026-10-02T00:01:00+00:00",false],["2026-10-02T00:00:00+00:00",true],
   ["2026-10-02T00:00:00-00:00",true],["2026-10-02T00:00:00+0000",true],["2026-10-02T00:00:00-0000",true],
   ["2026-10-01T00:01:00-23:59",true],["2026-10-01T00:01:00-2359",true],["2026-10-01T00:01:00.000001-23:59",false],["2026-10-01T00:01:00.000001-2359",false],
   ["2026-10-02T05:45:00+05:45",true],["2026-10-02T05:45:00+0545",true],["2026-10-02T05:45:00.000000001+05:45",false],["2026-10-01T18:30:00-05:30",true],
   ["2026-10-02T00:00:00Z",true],["2026-10-02T00:00:00.000000Z",true],["2026-10-02T00:00:00.000000001Z",false],
  ] as const) {
   expect(receiptAllocationV1.safeParse(at(existed)).success).toBe(true);
   expect(ids(at(existed))).toEqual(included?["baseline","late"]:["baseline"]);
  }
 });
});
