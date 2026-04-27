import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useSignerContext } from "context/SignerContext";

type RecentSettlementClaimContextValue = {
	/**
	 * Market keys in the same shape as Winnings row `market._id`: LevelUp Mongo
	 * `balanceId`, and `poly-win-*` / `predict-win-*` / `dflow-win-*` prefixes for
	 * off-chain claims. When present, that payout must not be counted in portfolio
	 * until balances refetch, so we do not double-count with updated cash.
	 */
	acknowledgedClearedPayoutKeys: ReadonlySet<string>;
	acknowledgeClearedPayouts: (keys: string[]) => void;
};

const RecentSettlementClaimContext =
	createContext<RecentSettlementClaimContextValue | null>(null);

/**
 * After a successful claim, register the same `marketId` values passed to
 * `onClaimSuccess` so `PortfolioContext` can ignore stale winning balances / venue
 * rows until RPC + queries converge.
 */
export function RecentSettlementClaimProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { account } = useSignerContext();
	const [keys, setKeys] = useState<string[]>([]);

	useEffect(() => {
		setKeys([]);
	}, [account]);

	const acknowledgedClearedPayoutKeys = useMemo(
		() => new Set(keys),
		[keys],
	);

	const acknowledgeClearedPayouts = useCallback((next: string[]) => {
		if (next.length === 0) return;
		setKeys((prev) => {
			const s = new Set(prev);
			for (const k of next) {
				if (k && String(k).trim()) s.add(String(k).trim());
			}
			return Array.from(s);
		});
	}, []);

	const value = useMemo(
		() => ({ acknowledgedClearedPayoutKeys, acknowledgeClearedPayouts }),
		[acknowledgedClearedPayoutKeys, acknowledgeClearedPayouts],
	);

	return (
		<RecentSettlementClaimContext.Provider value={value}>
			{children}
		</RecentSettlementClaimContext.Provider>
	);
}

export function useRecentSettlementClaim(): RecentSettlementClaimContextValue {
	const ctx = useContext(RecentSettlementClaimContext);
	if (!ctx) {
		throw new Error(
			"useRecentSettlementClaim must be used within RecentSettlementClaimProvider",
		);
	}
	return ctx;
}

/**
 * Public helper so Poly / Predict / DFlow portfolio math matches Winnings
 * `market._id` keys from `usePositionsData` (appendVenueWinnings).
 */
export function syntheticVenueWinningsRowId(
	venue: "polymarket" | "predictfun" | "dflow" | "limitless",
	tokenId: string,
): string {
	const p =
		venue === "polymarket"
			? "poly-win"
			: venue === "dflow"
				? "dflow-win"
				: venue === "limitless"
					? "lx-win"
					: "predict-win";
	return `${p}-${(tokenId ?? "").slice(0, 12)}`;
}
