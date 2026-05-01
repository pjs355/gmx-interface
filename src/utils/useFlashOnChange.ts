import { useEffect, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 540;

export interface UseFlashOnChangeOptions {
	/** How long the flash class stays applied (matches the SCSS animation total). */
	durationMs?: number;
	/** Class name appended to the cell when the formatted value changes. */
	className?: string;
}

/**
 * Returns a className that's non-empty for a brief window after `key` changes.
 *
 * - Skips the flash on first mount (prevents a spurious blink as the first values arrive).
 * - Survives React 18 strict-mode double-mount via a ref sentinel (refs persist across the
 *   simulated unmount/remount).
 * - Compares the FORMATTED display string so float jitter that doesn't change what the user
 *   sees never triggers a flash.
 * - Honors `prefers-reduced-motion`: the class is still added/removed but the SCSS keyframes
 *   are no-ops under that media query.
 */
export function useFlashOnChange(
	key: string,
	opts?: UseFlashOnChangeOptions,
): string {
	const durationMs = opts?.durationMs ?? DEFAULT_DURATION_MS;
	const className = opts?.className ?? "smart-routing-row__value--flash";

	const prevKeyRef = useRef<string | null>(null);
	const initializedRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [flashing, setFlashing] = useState(false);

	useEffect(() => {
		if (!initializedRef.current) {
			initializedRef.current = true;
			prevKeyRef.current = key;
			return;
		}
		if (prevKeyRef.current === key) return;
		prevKeyRef.current = key;
		if (timerRef.current) clearTimeout(timerRef.current);
		setFlashing(true);
		timerRef.current = setTimeout(() => {
			setFlashing(false);
			timerRef.current = null;
		}, durationMs);
	}, [key, durationMs]);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	return flashing ? className : "";
}
