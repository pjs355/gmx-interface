import { useMemo } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import type { AccountOverview, PolymarketAccountResponse } from "@/types/trading";

export type NormalizedTradingWallets = {
	/** Coinbase Smart Wallet on Base — primary LevelUp balance / LI.FI `from` on Base */
	baseSmartWallet: string | undefined;
	/** Privy embedded EOA — Polymarket signer */
	embeddedEoa: string | undefined;
	/** Polymarket Safe on Polygon */
	polymarketSafe: string | undefined;
	/** Same as embedded EOA when Polygon txs use the embedded wallet */
	polygonSigner: string | undefined;
	solanaAddress: string | undefined;
};

function readSmartWalletFromUser(user: unknown): string | undefined {
	const linked = (user as { linkedAccounts?: unknown[] } | null)?.linkedAccounts;
	if (!Array.isArray(linked)) return undefined;
	const smart = linked.find(
		(a) => (a as { type?: string })?.type === "smart_wallet"
	) as { address?: string } | undefined;
	return smart?.address;
}

/**
 * Single normalized view of wallet roles (Privy + server read model).
 */
export function useTradingWallets(
	accountOverview: AccountOverview | undefined,
	polymarketAccount: PolymarketAccountResponse | undefined
): NormalizedTradingWallets {
	const { user } = usePrivy();
	const { wallets } = usePrivyWallets();

	return useMemo(() => {
		const smartFromUser = readSmartWalletFromUser(user as unknown);
		const overviewWallet = accountOverview?.wallets?.find(
			(w) =>
				String(w.kind ?? "").toLowerCase() === "smart_wallet" ||
				String(w.kind ?? "").toLowerCase() === "coinbase_smart_wallet"
		);
		const baseSmartWallet =
			(typeof overviewWallet?.address === "string" && overviewWallet.address) ||
			smartFromUser;

		const embedded = (wallets || []).find(
			(w: { walletClientType?: string; connectorType?: string }) =>
				w?.walletClientType === "privy" || w?.connectorType === "privy"
		) as { address?: string } | undefined;

		const embeddedEoa =
			(typeof polymarketAccount?.polymarketAccount?.signerAddress === "string" &&
				polymarketAccount.polymarketAccount.signerAddress) ||
			embedded?.address;

		const polymarketSafe =
			(typeof polymarketAccount?.polymarketAccount?.safeWalletAddress ===
				"string" && polymarketAccount.polymarketAccount.safeWalletAddress) ||
			(accountOverview?.venues
				?.find((v) => String(v.venueId).toLowerCase() === "polymarket")
				?.fundingDestination?.address as string | undefined);

		const solWallet = (wallets || []).find((w) => {
			const cw = w as { chainType?: string; address?: string };
			return cw.chainType === "solana";
		}) as { address?: string } | undefined;

		const solOverview = accountOverview?.wallets?.find(
			(w) => String(w.chainFamily ?? "").toLowerCase() === "solana"
		);

		return {
			baseSmartWallet,
			embeddedEoa,
			polymarketSafe,
			polygonSigner: embeddedEoa,
			solanaAddress:
				solWallet?.address ??
				(typeof solOverview?.address === "string" ? solOverview.address : undefined),
		};
	}, [user, wallets, accountOverview, polymarketAccount]);
}
