import { useCallback, useRef } from "react";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";

/**
 * Bundles the imperative deposit trigger for onboarding's auto-open step.
 * Uses `RegisterDepositAction` (mounted by the modal) to sync `buyWithCard()` into a ref.
 */
export function useDepositAfterSetup() {
	const venueAddressChainMap = useVenueAddressChainMap();
	const depositReady = Boolean(venueAddressChainMap?.levelup.walletAddress);

	const depositActionRef = useRef<(() => Promise<void>) | null>(null);

	const triggerDeposit = useCallback(async (): Promise<boolean> => {
		const fn = depositActionRef.current;
		if (!fn) return false;
		try {
			await fn();
			return true;
		} catch (err) {
			console.error("[Onboarding] deposit trigger failed:", err);
			return false;
		}
	}, []);

	return {
		depositActionRef,
		triggerDeposit,
		depositReady,
	};
}
