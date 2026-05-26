import { getVenueConfig, type TradingVenue } from "@/config/venueConfig";
import type { VenueAddressChainMap } from "@/context/accountWallets";
import type { CollateralTokens } from "context/CollateralTokenContext";
import type { SorChain, SorVenue } from "@/features/trading/sor/core/sor-types";

export type TransfersVenueAddressRow = {
	venue: SorVenue;
	venueLabel: string;
	chainLabel: string;
	collateralLabel: string;
	/** Base wallet role — only LevelUp (SCW) and Limitless (EOA). */
	walletKindLabel?: string;
	address: string;
	balance: number;
	copyKey: string;
};

const CHAIN_LABELS: Record<SorChain, string> = {
	base: "Base",
	polygon: "Polygon",
	bnb: "BNB Chain",
	solana: "Solana",
};

/** One row per trading venue — order matches common funding mental model. */
const VENUE_ORDER: SorVenue[] = ["levelup", "limitless", "polymarket", "predictfun", "dflow"];

function collateralLabelForVenue(venue: SorVenue): string {
	if (venue === "polymarket") return "pUSD";
	return getVenueConfig(venue as TradingVenue).collateral;
}

function balanceForVenue(venue: SorVenue, collateral: CollateralTokens): number {
	switch (venue) {
		case "levelup":
			return collateral.baseUsdc;
		case "limitless":
			return collateral.limitlessMakerUsdc;
		case "polymarket":
			return collateral.polygonStable;
		case "predictfun":
			return collateral.bscUsdt;
		case "dflow":
			return collateral.solanaUsdc;
		default: {
			const _exhaustive: never = venue;
			throw new Error(`Unknown venue: ${String(_exhaustive)}`);
		}
	}
}

export function buildTransfersVenueAddressRows(
	vacm: VenueAddressChainMap | null,
	collateral: CollateralTokens,
): TransfersVenueAddressRow[] {
	if (!vacm) return [];

	return VENUE_ORDER.map((venue) => {
		const entry = vacm[venue];
		const config = getVenueConfig(venue as TradingVenue);
		return {
			venue,
			venueLabel: config.displayName,
			chainLabel: CHAIN_LABELS[entry.chain],
			collateralLabel: collateralLabelForVenue(venue),
			walletKindLabel: venue === "levelup" ? "SCW" : venue === "limitless" ? "EOA" : undefined,
			address: entry.walletAddress,
			balance: balanceForVenue(venue, collateral),
			copyKey: venue,
		};
	});
}
