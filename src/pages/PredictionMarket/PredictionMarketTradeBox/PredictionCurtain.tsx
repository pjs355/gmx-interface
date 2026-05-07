import React, { createContext, useContext, useState, ReactNode, useRef, useEffect, useLayoutEffect } from 'react';
import Portal from 'components/Common/Portal';

// Simplified curtain context for prediction markets
interface CurtainContextType {
  isCurtainOpen: boolean;
  openCurtain: () => void;
  closeCurtain: () => void;
}

const CurtainContext = createContext<CurtainContextType | null>(null);

export function PredictionCurtainProvider({
	children,
	onCurtainClosed,
}: {
	children: ReactNode;
	onCurtainClosed?: () => void;
}) {
	const [isCurtainOpen, setIsCurtainOpen] = useState(false);

	const closeCurtain = () => {
		setIsCurtainOpen(false);
		onCurtainClosed?.();
	};

	const openCurtain = () => setIsCurtainOpen(true);

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

  /*
   * Safety net for the React node-reuse issue described in `handleTouchEnd`.
   * If a previous swipe-dismiss was interrupted (page hidden, gesture cancelled,
   * etc.) the inline `transform`/`transition` set on `contentRef.current` may
   * survive to the next render and pin the reused `<div>` offscreen. When the
   * curtain just closed, query the still-mounted wrapper for a child div with
   * a leftover `translateY` and reset it before paint.
   */
  useLayoutEffect(() => {
    if (isCurtainOpen) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const child = wrapper.firstElementChild as HTMLElement | null;
    if (child && (child.style.transform || child.style.transition)) {
      child.style.transition = '';
      child.style.transform = '';
    }
  }, [isCurtainOpen]);

  // Lock background page scroll while the curtain is open so only the
  // tradebox can scroll. Mirrors the pattern used by the header drawer
  // (Header.tsx) — restores `scrollY` on close to avoid jump.
  useEffect(() => {
    if (!isCurtainOpen) return;
    const scrollY = window.scrollY;
    document.body.setAttribute('data-curtain-scroll-y', scrollY.toString());
    document.documentElement.classList.add('curtain-open');
    document.body.classList.add('curtain-open');
    document.body.style.top = `-${scrollY}px`;
    return () => {
      document.documentElement.classList.remove('curtain-open');
      document.body.classList.remove('curtain-open');
      const saved = document.body.getAttribute('data-curtain-scroll-y');
      document.body.removeAttribute('data-curtain-scroll-y');
      document.body.style.top = '';
      if (saved) window.scrollTo(0, parseInt(saved, 10));
    };
  }, [isCurtainOpen]);

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
      // Drag tracks the finger 1:1 — kill any pending settle/close transition.
      contentRef.current.style.transition = 'none';
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || !contentRef.current) return;
      e.preventDefault();
      currentY.current = e.touches[0].clientY;
      const deltaY = currentY.current - startY.current;

      if (deltaY > 0) {
        // No upper clamp: let the panel follow the finger off-screen so the
        // close gesture feels physical instead of stalling at 100px.
        contentRef.current.style.transform = `translateY(${deltaY}px)`;
      } else {
        contentRef.current.style.transform = '';
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging.current || !contentRef.current) return;
      isDragging.current = false;

      const el = contentRef.current;
      const deltaY = currentY.current - startY.current;

      if (deltaY > 80) {
        // Past dismiss threshold — glide the rest of the way off-screen
        // before unmounting so the user doesn't see a hard jump cut.
        el.style.transition =
          'transform 220ms cubic-bezier(0.4, 0, 1, 1)';
        el.style.transform = 'translateY(100%)';
        const onEnd = () => {
          el.removeEventListener('transitionend', onEnd);
          /*
           * IMPORTANT: clear inline styles BEFORE closeCurtain triggers a
           * re-render. The conditional in this component renders a `<div>`
           * for both the open content and the closed peek-bar header, and
           * React reuses the same DOM node when swapping between two divs
           * at the same position. The inline `transform: translateY(100%)`
           * we set above is not managed by React, so without this reset
           * it persists on the reused node and pushes the freshly-rendered
           * peek bar (the yes/no buttons at the bottom) offscreen.
           */
          el.style.transition = '';
          el.style.transform = '';
          closeCurtain?.();
        };
        el.addEventListener('transitionend', onEnd);
        return;
      }

      // Spring back to the resting position. (Same node-reuse concern doesn't
      // apply here because the curtain stays open.)
      el.style.transition =
        'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
      el.style.transform = '';
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
      {isCurtainOpen && (
        <div
          className="prediction-curtain-backdrop"
          onClick={() => closeCurtain?.()}
          aria-hidden="true"
        />
      )}
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
