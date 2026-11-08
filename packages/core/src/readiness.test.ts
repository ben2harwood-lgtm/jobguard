import{describe,expect,it}from"vitest";import{assertAcyclicDependencies,dueAtLocalTime,evaluateReadiness,nextWorkday,proposeResequence,type ResequencePlan}from"./readiness.js";
const base={version:"readiness-input.v1"as const,taskId:"paint",taskRevision:1,ruleRevision:"readiness.v1",predecessors:[{taskId:"prep",complete:false as const}],material:{requiredUnits:10,landedUnits:8},access:true as const,crew:"unknown"as const,weather:{suitable:true as const,observedAt:"2026-03-27T09:00:00Z",staleAfterMinutes:180,synthetic:true as const,adapterRevision:"generated-weather.v1"},evaluatedAt:"2026-03-27T10:00:00Z"};
describe("pure readiness",()=>{it("reports explicit facts without inventing money",()=>{const r=evaluateReadiness(base);expect(r.ready).toBe(false);expect(r.reasons).toEqual(["A predecessor is not complete","2 units still needed","Crew availability unknown"]);expect(r.exposure).toBeNull();expect(r.recoveryFee.pence).toBe(0)});it("treats stale weather and adapter outage as unknown",()=>{expect(evaluateReadiness({...base,predecessors:[],material:{requiredUnits:8,landedUnits:8},crew:true,evaluatedAt:"2026-03-27T13:00:01Z"}).weather).toBe("unknown");expect(evaluateReadiness({...base,weather:null}).weather).toBe("unknown")});it("uses exact recorded labour inputs",()=>expect(evaluateReadiness({...base,labourRatePence:2500,uncertainDurationHours:8}).exposure?.pence).toBe(20000));it("rejects dependency cycles",()=>expect(()=>assertAcyclicDependencies([{taskId:"a",dependsOnTaskId:"b"},{taskId:"b",dependsOnTaskId:"a"}])).toThrow("DEPENDENCY_CYCLE"));it("handles weekends and jurisdiction calendars",()=>{const h={"england-and-wales":["2026-08-31"],scotland:[],"northern-ireland":[]}as const;expect(nextWorkday("2026-08-28","england-and-wales",h)).toBe("2026-09-01");expect(nextWorkday("2026-08-28","scotland",h)).toBe("2026-08-31")});it("schedules across UK DST",()=>{expect(dueAtLocalTime("2026-03-27","09:00","Europe/London")).toBe("2026-03-27T09:00:00.000Z");expect(dueAtLocalTime("2026-03-30","09:00","Europe/London")).toBe("2026-03-30T08:00:00.000Z")})});


const blocked: ResequencePlan = { scope: { tenantId: "t", jobId: "j", taskId: "blocked" },
  status: "confirmed", plannedDate: "2026-11-05", crew: true, access: false,
  predecessors: [], edges: [], material: { requiredUnits: 1, landedUnits: 0 } };
const candidate = (taskId = "next", patch: Partial<ResequencePlan> = {}): ResequencePlan => ({
  ...blocked, scope: { ...blocked.scope, taskId }, access: true, plannedDate: "2026-11-06",
  material: { requiredUnits: 1, landedUnits: 1 }, ...patch,
});
describe("pure resequencing proposals", () => {
  it("orders at most three later confirmed tasks by date then identity without mutation", () => {
    const plans = [candidate("d"), candidate("c"), candidate("b"), candidate("a"), candidate("earlier", { plannedDate: "2026-11-07" })];
    const before = structuredClone(plans);
    expect(proposeResequence(blocked, plans)).toEqual(["a", "b", "c"].map(taskId => ({ taskId, fromDate: "2026-11-06", toDate: blocked.plannedDate })));
    expect(plans).toEqual(before);
  });
  it("requires the blocked crew and every candidate fact to be explicitly available", () => {
    for (const crew of [false, "unknown"] as const) expect(proposeResequence({ ...blocked, crew }, [candidate()])).toEqual([]);
    for (const patch of [
      { status: "cancelled" as const }, { plannedDate: blocked.plannedDate }, { access: "unknown" as const },
      { access: false as const }, { crew: "unknown" as const }, { crew: false as const },
      { material: { requiredUnits: 2, landedUnits: 1 } },
      { predecessors: [{ taskId: "prep", complete: "unknown" as const }] },
      { predecessors: [{ taskId: "prep", complete: false as const }] },
      { edges: [{ taskId: "next", dependsOnTaskId: "missing" }] },
      { scope: { ...blocked.scope, taskId: "next", tenantId: "elsewhere" } },
      { scope: { ...blocked.scope, taskId: "next", jobId: "elsewhere" } },
    ]) expect(proposeResequence(blocked, [candidate("next", patch)])).toEqual([]);
    expect(proposeResequence(blocked, [candidate("next", { predecessors: [{ taskId: "prep", complete: true }], material: { requiredUnits: 1, landedUnits: 2 } })])).toHaveLength(1);
  });
  it("rejects direct/transitive dependencies and cycles even with claimed complete facts", () => {
    const dependent = candidate("next", { predecessors: [{ taskId: "blocked", complete: true }] });
    expect(proposeResequence(blocked, [dependent])).toEqual([]);
    const indirect = candidate("next", { predecessors: [{ taskId: "middle", complete: true }] });
    const middle = candidate("middle", { predecessors: [{ taskId: "blocked", complete: true }] });
    expect(proposeResequence(blocked, [indirect, middle])).toEqual([]);
    expect(proposeResequence(blocked, [candidate("next", { edges: [
      { taskId: "next", dependsOnTaskId: "middle" }, { taskId: "middle", dependsOnTaskId: "next" },
    ] })])).toEqual([]);
  });
});
