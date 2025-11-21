import { useState, useEffect } from 'react';

/**
 * Hook that returns animated dots cycling through: ".", "..", "...", ""
 * @param interval - Time in milliseconds between each animation step (default: 400ms)
 * @returns Current dots string
 */
export function useAnimatedDots(interval: number = 400): string {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const dotStates = ['', '.', '..', '...'];
    let currentIndex = 0;
    
    const timer = setInterval(() => {
      currentIndex = (currentIndex + 1) % dotStates.length;
      setDots(dotStates[currentIndex]);
    }, interval);
    
    return () => clearInterval(timer);
  }, [interval]);
  
  return dots;
}

