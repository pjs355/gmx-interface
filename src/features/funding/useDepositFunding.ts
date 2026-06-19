import { useCallback, useState } from "react";
import { useFiatOnramp } from "@privy-io/react-auth";
import { useDepositAddress } from "@privy-io/react-auth/internal";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { BASE_CAIP2, resolveBaseFiatTarget, type ResolvedDepositTarget } from "./depositDestinations";
import { useAfterDepositRefresh } from "./useAfterDepositRefresh";

function isUserExitError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const msg = err.message.toLowerCase();
	return msg.includes("user exited") || msg.includes("closed") || msg.includes("cancel");
}

/** Fiat + crypto deposits always deliver USDC to the LevelUp smart wallet on Base. */
export function useDepositFunding(opts?: { onComplete?: () => void }) {
	const { onComplete } = opts ?? {};
	const { fund } = useFiatOnramp();
	const { createDepositAddress } = useDepositAddress();
	const vacm = useVenueAddressChainMap();
	const refreshCash = useAfterDepositRefresh();
	const [loading, setLoading] = useState(false);

	const baseTarget = resolveBaseFiatTarget(vacm);

	const canBuyWithCard = Boolean(baseTarget) && !loading;
	const canSendCrypto = Boolean(baseTarget) && !loading;

	const buyWithCard = useCallback(async () => {
		if (!baseTarget || loading) return;
		setLoading(true);
		try {
			const result = await fund({
				source: { assets: ["usd"], defaultAsset: "usd" },
				destination: {
					asset: "usdc",
					chain: BASE_CAIP2,
					address: baseTarget.address,
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
	}, [baseTarget, loading, fund, refreshCash, onComplete]);

	const sendCrypto = useCallback(async () => {
		if (!baseTarget || loading) return;
		setLoading(true);
		try {
			await createDepositAddress({
				destinationChain: baseTarget.chainCaip2,
				destinationCurrency: baseTarget.tokenAddress,
				destinationAddress: baseTarget.address,
			});
			await refreshCash();
			onComplete?.();
		} catch (err) {
			if (err instanceof Error && err.message.includes("DEPOSIT_ADDRESSES_NOT_ENABLED")) {
				throw new Error(
					"Crypto deposit addresses are not enabled. Enable them in the Privy Dashboard under Funding.",
				);
			}
			if (!isUserExitError(err)) {
				console.error("Deposit address error:", err);
			}
		} finally {
			setLoading(false);
		}
	}, [baseTarget, loading, createDepositAddress, refreshCash, onComplete]);

	return {
		buyWithCard,
		sendCrypto,
		canBuyWithCard,
		canSendCrypto,
		loading,
		baseTarget: baseTarget as ResolvedDepositTarget | null,
	};
}
