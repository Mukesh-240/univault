"use client";
/**
 * USE STEP MOTION — call it with a wizard element and the current step number; whenever the step changes (not on the
 * first screen) the new step slides in from the right (forward) or left (back) and the progress bar glows.
 */
import { useEffect, useRef, type RefObject } from "react";
import { stepArrives } from "@/lib/motion-effects";

export function useStepMotion(root: RefObject<HTMLElement | null>, step: number) {
  const prev = useRef(step);
  useEffect(() => {
    if (prev.current !== step) void stepArrives(root.current, step > prev.current ? 1 : -1);
    prev.current = step;
  }, [root, step]);
}
