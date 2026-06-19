import { useCallback, useState } from "react";
import { useFiatOnramp } from "@privy-io/react-auth";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { BASE_CAIP2, resolveBaseFiatTarget, type ResolvedDepositTarget } from "./depositDestinations";
import { useAfterDepositRefresh } from "./useAfterDepositRefresh";

function isUserExitError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const msg = err.message.toLowerCase();
	return msg.includes("user exited") || msg.includes("closed") || msg.includes("cancel");
}

export function useQuickFiatDeposit(onComplete?: () => void) {
	const { fund } = useFiatOnramp();
	const vacm = useVenueAddressChainMap();
	const refreshCash = useAfterDepositRefresh();
	const [loading, setLoading] = useState(false);

	const baseFiatTarget = resolveBaseFiatTarget(vacm);
	const canBuyWithCard = Boolean(baseFiatTarget) && !loading;

	const buyWithCard = useCallback(async () => {
		if (!baseFiatTarget || loading) return;
		setLoading(true);
		try {
			const result = await fund({
				source: { assets: ["usd"], defaultAsset: "usd" },
				destination: {
					asset: "usdc",
					chain: BASE_CAIP2,
					address: baseFiatTarget.address,
				},
				environment: "production",
			});
			if (result.status === "submitted" || result.status === "confirmed") {
				await refreshCash();
				onComplete?.();
			}
		} catch (err) {
			if (!isUserExitError(err)) {
				console.error("Fiat onramp error:", err);
			}
		} finally {
			setLoading(false);
		}
	}, [baseFiatTarget, loading, fund, refreshCash, onComplete]);

	return {
		buyWithCard,
		canBuyWithCard,
		loading,
		baseFiatTarget: baseFiatTarget as ResolvedDepositTarget | null,
	};
}
