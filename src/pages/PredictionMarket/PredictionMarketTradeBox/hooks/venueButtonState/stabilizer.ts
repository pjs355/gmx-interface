import { useEffect, useRef, useState } from "react";
import { userMessage, BTN_FETCHING_PRICE } from "@/errors";
import type { ButtonStateResult } from "./types";

/* ----------------------------------------------------------------------------
 * Loading-flicker stabilizer
 *
 * On a tab switch the targeted SOR refetch briefly nulls `executableRoute`,
 * which previously caused the Submit button to flash "Fetching price…" for
 * the duration of the round-trip (~300ms–1s). To make tab switching feel
 * instant, we hold the previous settled button result for a short grace
 * window after the loading text first appears.
 * -------------------------------------------------------------------------- */
export const BUTTON_LOADING_HOLD_MS = 450;

const FETCHING_PRICE_TEXTS = new Set<string>([
	userMessage(BTN_FETCHING_PRICE),
	"Fetching price",
	"Fetching price...",
	"Finding best price...",
	"Finding best price",
]);

function isFetchingPriceText(text: string): boolean {
	return FETCHING_PRICE_TEXTS.has(text);
}

export function useStabilizedButtonResult(
	raw: ButtonStateResult,
	holdMs: number,
): ButtonStateResult {
	const isLoadingNow = isFetchingPriceText(raw.text);
	const lastSettledRef = useRef<ButtonStateResult | null>(null);
	const heldRef = useRef<ButtonStateResult | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [, forceTick] = useState(0);

	if (!isLoadingNow) {
		lastSettledRef.current = raw;
		if (heldRef.current != null) heldRef.current = null;
	} else if (heldRef.current == null && lastSettledRef.current != null) {
		heldRef.current = lastSettledRef.current;
	}

	useEffect(() => {
		if (!isLoadingNow) {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			return;
		}
		if (heldRef.current == null) return;
		if (timerRef.current != null) return;
		timerRef.current = setTimeout(() => {
			heldRef.current = null;
			timerRef.current = null;
			forceTick((n) => n + 1);
		}, holdMs);
	}, [isLoadingNow, holdMs]);

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		},
		[],
	);

	if (isLoadingNow && heldRef.current != null) {
		return { ...heldRef.current, disabled: true, onClick: () => {} };
	}
	return raw;
}
