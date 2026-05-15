import { useMemo } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import type {
	AccountOverview,
	PolymarketAccountResponse,
	WalletDescriptor,
} from "@/types/trading";
import { findEvmPrivyEmbeddedWallet, type PrivyWalletListEntry } from "@/trading/polymarket/privyEmbeddedWallet";

/**
 * Account overview `wallets[]` rows from the API use `walletType: "smart"` (see server `WalletRecord`).
 * Legacy clients used `kind: "smart_wallet"`. Exported for unit tests.
 */
export function overviewWalletIsEvmSmartWallet(w: WalletDescriptor): boolean {
	const kind = String(w.kind ?? "").toLowerCase();
	if (kind === "smart_wallet" || kind === "coinbase_smart_wallet") return true;

	const ext = w as WalletDescriptor & {
		walletType?: string;
		walletRoleTags?: readonly string[];
	};
	const chainFamily = String(w.chainFamily ?? "").toLowerCase();
	if (chainFamily === "solana") return false;

	const wt = String(ext.walletType ?? "").toLowerCase();
	if (wt === "smart") return true;

	const tags = ext.walletRoleTags;
	if (!Array.isArray(tags)) return false;
	return tags.some((t) => String(t) === "evmSmartWallet");
}

export type NormalizedTradingWallets = {
	/** Coinbase Smart Wallet on Base — primary LevelUp balance / LI.FI `from` on Base */
	baseSmartWallet: string | undefined;
	/**
	 * Limitless partner server-wallet maker on Base (8453) — venue collateral for delegated orders.
	 * From account overview `venues[limitless].fundingDestination` (same as API `limitlessAccount.makerAddress`).
	 */
	limitlessMakerBase: string | undefined;
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

/** Match DFlow / Profile: Privy exposes Solana on linkedAccounts before wallets() may list it */
function readSolanaAddressFromUser(user: unknown): string | undefined {
	const linked = (user as { linkedAccounts?: unknown[] } | null)?.linkedAccounts;
	if (!Array.isArray(linked)) return undefined;
	const sol = linked.find(
		(a) =>
			(a as { type?: string; chainType?: string })?.type === "wallet" &&
			(a as { chainType?: string })?.chainType === "solana"
	) as { address?: string } | undefined;
	return typeof sol?.address === "string" && sol.address.trim()
		? sol.address.trim()
		: undefined;
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
		const overviewWallet = accountOverview?.wallets?.find(overviewWalletIsEvmSmartWallet);
		const overviewAddr =
			typeof overviewWallet?.address === "string" ? overviewWallet.address.trim() : "";
		const privyScw =
			typeof smartFromUser === "string" && smartFromUser.trim() ? smartFromUser.trim() : undefined;
		const baseSmartWallet = overviewAddr || privyScw || undefined;

		const embedded = findEvmPrivyEmbeddedWallet(
			(wallets || []) as readonly PrivyWalletListEntry[]
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

		const lxDest = accountOverview?.venues?.find(
			(v) => String(v.venueId).toLowerCase() === "limitless",
		)?.fundingDestination;
		const limitlessMakerRaw =
			typeof lxDest?.address === "string" ? lxDest.address.trim() : "";
		const limitlessMakerBase =
			/^0x[a-fA-F0-9]{40}$/.test(limitlessMakerRaw) ? limitlessMakerRaw : undefined;

		const solWallet = (wallets || []).find((w) => {
			const cw = w as { chainType?: string; address?: string };
			return cw.chainType === "solana";
		}) as { address?: string } | undefined;

		const solOverview = accountOverview?.wallets?.find(
			(w) => String(w.chainFamily ?? "").toLowerCase() === "solana"
		);

		const solFromLinked = readSolanaAddressFromUser(user);
		return {
			baseSmartWallet,
			limitlessMakerBase,
			embeddedEoa,
			polymarketSafe,
			polygonSigner: embeddedEoa,
			solanaAddress:
				solWallet?.address ??
				(typeof solOverview?.address === "string" ? solOverview.address : undefined) ??
				solFromLinked,
		};
	}, [user, wallets, accountOverview, polymarketAccount]);
}
