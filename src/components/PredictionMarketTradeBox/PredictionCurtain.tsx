import React, { createContext, useContext, useState, ReactNode, useRef, useEffect } from 'react';
import Portal from 'components/Common/Portal';

// Simplified curtain context for prediction markets
interface CurtainContextType {
  isCurtainOpen: boolean;
  openCurtain: () => void;
  closeCurtain: () => void;
}

const CurtainContext = createContext<CurtainContextType | null>(null);

export function PredictionCurtainProvider({ children }: { children: ReactNode }) {
  const [isCurtainOpen, setIsCurtainOpen] = useState(false);

  const openCurtain = () => setIsCurtainOpen(true);
  const closeCurtain = () => setIsCurtainOpen(false);

  return (
    <CurtainContext.Provider value={{ isCurtainOpen, openCurtain, closeCurtain }}>
      {children}
    </CurtainContext.Provider>
  );
}

export function useIsCurtainOpen() {
  const context = useContext(CurtainContext);
  return context?.isCurtainOpen ?? false;
}

export function useCurtainActions() {
  const context = useContext(CurtainContext);
  return {
    openCurtain: context?.openCurtain ?? (() => {}),
    closeCurtain: context?.closeCurtain ?? (() => {}),
  };
}

export function PredictionCurtain({ header, children, dataQa }: { header?: ReactNode; children: ReactNode; dataQa?: string }) {
  const { isCurtainOpen, closeCurtain } = useContext(CurtainContext) ?? {};
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  // Keep the fixed bar visually pinned to the bottom when browser UI shows/hides (iOS Safari, Chrome Android)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    let rafId: number | null = null;
    let lastApplied = 0;

    const scheduleApply = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const vv = (window as any).visualViewport as VisualViewport | undefined;
        // Only compensate when the curtain is CLOSED (only yes/no header visible)
        if (!el) return;
        if (isCurtainOpen) {
          el.style.transform = '';
          lastApplied = 0;
          return;
        }
        if (!vv) {
          // No visualViewport support; avoid transforms to prevent jitter
          el.style.transform = '';
          lastApplied = 0;
          return;
        }
        const rawOffset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        const offset = Math.round(rawOffset); // snap to device pixels
        // Ignore tiny offsets to avoid micro-jitter
        if (Math.abs(offset) <= 2) {
          if (lastApplied !== 0) {
            el.style.transform = '';
            lastApplied = 0;
          }
          return;
        }
        if (offset !== lastApplied) {
          el.style.transform = `translateY(-${offset}px)`;
          lastApplied = offset;
        }
      });
    };

    const vv = (window as any).visualViewport as VisualViewport | undefined;
    scheduleApply();
    if (vv) {
      vv.addEventListener('resize', scheduleApply);
      vv.addEventListener('scroll', scheduleApply);
      window.addEventListener('orientationchange', scheduleApply);
    } else {
      // Fallback: still listen to resize/orientation
      window.addEventListener('resize', scheduleApply);
      window.addEventListener('orientationchange', scheduleApply);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (vv) {
        vv.removeEventListener('resize', scheduleApply);
        vv.removeEventListener('scroll', scheduleApply);
        window.removeEventListener('orientationchange', scheduleApply);
      } else {
        window.removeEventListener('resize', scheduleApply);
        window.removeEventListener('orientationchange', scheduleApply);
      }
    };
  }, [isCurtainOpen]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (!isCurtainOpen || !contentRef.current) return;
      startY.current = e.touches[0].clientY;
      currentY.current = e.touches[0].clientY;
      isDragging.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || !contentRef.current) return;
      e.preventDefault();
      currentY.current = e.touches[0].clientY;
      const deltaY = currentY.current - startY.current;
      
      if (deltaY > 0) {
        contentRef.current.style.transform = `translateY(${Math.min(deltaY, 100)}px)`;
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging.current || !contentRef.current) return;
      isDragging.current = false;
      
      const deltaY = currentY.current - startY.current;
      if (deltaY > 50) {
        closeCurtain?.();
      }
      
      contentRef.current.style.transform = '';
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener('touchstart', handleTouchStart, { passive: false });
      content.addEventListener('touchmove', handleTouchMove, { passive: false });
      content.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      if (content) {
        content.removeEventListener('touchstart', handleTouchStart);
        content.removeEventListener('touchmove', handleTouchMove);
        content.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [isCurtainOpen, closeCurtain]);

  return (
    <Portal>
      <div ref={wrapperRef} className="prediction-curtain" data-qa={dataQa}>
        {isCurtainOpen ? (
          <div className="prediction-curtain-content" ref={contentRef}>
            {children}
          </div>
        ) : (
          header || null
        )}
      </div>
    </Portal>
  );
}
