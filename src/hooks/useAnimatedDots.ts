import { useState, useEffect } from 'react';

/**
 * Cycles ".", "..", "..." for loading-style labels (e.g. "Moving funds", "Executing trade").
 * @param interval - Milliseconds between steps (default: 400ms)
 */
export function useAnimatedDots(interval: number = 400): string {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const dotStates = [".", "..", "..."];
    let currentIndex = 0;

    const timer = setInterval(() => {
      currentIndex = (currentIndex + 1) % dotStates.length;
      setDots(dotStates[currentIndex]);
    }, interval);

    return () => clearInterval(timer);
  }, [interval]);

  return dots;
}

