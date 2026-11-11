"use client";
import { createContext, useContext, useEffect, useRef } from "react";

// Navigation invalidates saved facts without changing component keys or drafts.
export const JobFactsGeneration = createContext(0);
export function useJobFactsRefresh(refresh: () => void) {
 const generation = useContext(JobFactsGeneration);
 const latest = useRef(refresh); latest.current = refresh;
 const seen = useRef(generation);
 useEffect(() => {
  if (seen.current === generation) return;
  seen.current = generation;
  latest.current();
 }, [generation]);
}
