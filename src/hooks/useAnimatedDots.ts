import { useState, useEffect } from 'react';

/**
 * Cycles ".", "..", "..." for loading-style labels (e.g. "Moving funds", "Executing trade").
 * @param interval - Milliseconds between steps (default: 400ms)
 * @param active - When false, no timer runs (avoids re-renders when the label is not shown).
 */
export function useAnimatedDots(interval: number = 400, active: boolean = true): string {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    if (!active) {
      setDots(".");
      return;
    }

    const dotStates = [".", "..", "..."];
    let currentIndex = 0;

    const timer = setInterval(() => {
      currentIndex = (currentIndex + 1) % dotStates.length;
      setDots(dotStates[currentIndex]);
    }, interval);

    return () => clearInterval(timer);
  }, [interval, active]);

  return dots;
}

