import { useCallback, useRef } from "react";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";

/**
 * Bundles two concerns the Kalshi/Deposit step both need:
 *
 *   1. Privy fund target: `venueAddressChainMap.levelup.walletAddress` (Base SCW).
 *      We rely on the existing
 *      `RegisterPrivyOpenFundAction` component (mounted by the modal) to
 *      sync the actual `openFund()` callback into a ref — that pattern lets
 *      Privy's `useFundWallet` hook stay scoped to a small subtree without
 *      forcing the whole modal to re-render every time `fundTarget`
 *      changes.
 *   2. An imperative `triggerFund()` the modal's effect can call once when
 *      we land on `step === "deposit"`. Privy's `fundWallet` is fire-and-
 *      forget — there is no completion signal for "user added funds" —
 *      so we always call `markComplete()` BEFORE invoking it; otherwise a
 *      user who dismisses the Privy modal would land back in onboarding
 *      next session.
 */
export function useFundWalletAfterSetup() {
	const venueAddressChainMap = useVenueAddressChainMap();
	const fundTarget = venueAddressChainMap?.levelup.walletAddress;

	const fundActionRef = useRef<(() => void | Promise<void>) | null>(null);

	const triggerFund = useCallback(async (): Promise<boolean> => {
		const fn = fundActionRef.current;
		if (!fn) return false;
		try {
			await fn();
			return true;
		} catch (err) {
			console.error("[Onboarding] fundWallet trigger failed:", err);
			return false;
		}
	}, []);

	return {
		fundTarget,
		fundActionRef,
		triggerFund,
		fundReady: Boolean(fundTarget),
	};
}
