import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Reports whether the referenced element is within (or near) the viewport using
 * IntersectionObserver. `rootMargin` enlarges the trigger box so consumers can
 * react just before the element scrolls into view — e.g. pre-subscribing to a
 * live price feed so values are present by the time the element is on screen.
 *
 * Attach the returned ref to a real box element (an element with layout, not a
 * `display: contents` wrapper, which IntersectionObserver cannot observe).
 */
export function useInViewport<T extends Element>(rootMargin = "0px"): [RefObject<T>, boolean] {
	// `useRef<T>(null)` resolves to the RefObject<T> overload (not MutableRefObject),
	// which is what a JSX `ref={...}` prop expects.
	const ref = useRef<T>(null);
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		// Environments without IntersectionObserver (older test runners): treat as
		// visible so price subscriptions still happen rather than silently stalling.
		if (typeof IntersectionObserver === "undefined") {
			setInView(true);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry) setInView(entry.isIntersecting);
			},
			{ rootMargin },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [rootMargin]);

	return [ref, inView];
}
