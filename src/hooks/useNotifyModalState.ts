import { useState } from 'react';

export function useNotifyModalState() {
  const [isVisible, setIsVisible] = useState(false);
  
  return {
    isVisible,
    setIsVisible,
    open: () => setIsVisible(true),
    close: () => setIsVisible(false),
  };
}