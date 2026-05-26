import type { SorVenue } from "@/features/trading/sor/core/sor-types";
import type { AccountOverview, AccountVenueSlice } from "@/types/trading/accountOverview";
import type {
	OverviewVenueId,
	VenueRegulatorySetup,
	VenueSetupSlice,
	VenueSetupWallets,
} from "@/types/trading/venueSetup";
import { blockingReasonsToMessages } from "@/errors/readinessMessages";

export const OVERVIEW_VENUE_ID_BY_SOR: Record<SorVenue, OverviewVenueId> = {
	levelup: "levelup",
	polymarket: "polymarket",
	predictfun: "predict_fun",
	limitless: "limitless",
	dflow: "dflow_proof",
};

export type VenueSetupLookupKey = SorVenue | OverviewVenueId;

function resolveOverviewVenueId(key: VenueSetupLookupKey): OverviewVenueId {
	if (key in OVERVIEW_VENUE_ID_BY_SOR) {
		return OVERVIEW_VENUE_ID_BY_SOR[key as SorVenue];
	}
	return key as OverviewVenueId;
}

function parseWallets(raw: unknown): VenueSetupWallets {
	if (raw == null || typeof raw !== "object") {
		return { signer: null, maker: null, trading: null };
	}
	const o = raw as Record<string, unknown>;
	const str = (v: unknown): string | null =>
		typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
	return {
		signer: str(o.signer),
		maker: str(o.maker),
		trading: str(o.trading),
	};
}

function parseRegulatory(raw: unknown): VenueRegulatorySetup | null {
	if (raw == null || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	return {
		identityVerified: o.identityVerified === true,
		ownershipProofValid: o.ownershipProofValid === true,
	};
}

function parseStringArray(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((x): x is string => typeof x === "string");
}

/** Parse server `venues[].setup`; returns null when shape is absent. */
export function parseVenueSetupSlice(raw: unknown): VenueSetupSlice | null {
	if (raw == null || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	if (typeof o.sorCanInclude !== "boolean") return null;
	return {
		wallets: parseWallets(o.wallets),
		tradingWalletDeployed: o.tradingWalletDeployed === true,
		identityReady: o.identityReady === true,
		regulatory: parseRegulatory(o.regulatory),
		sorCanInclude: o.sorCanInclude,
		blockingReasons: parseStringArray(o.blockingReasons),
	};
}

/** Legacy fallback when API has not deployed `setup` yet. */
export function resolveVenueSetupFromSlice(venue: AccountVenueSlice): VenueSetupSlice {
	const parsed = parseVenueSetupSlice(venue.setup);
	if (parsed) return parsed;
	const blocking = venue.readiness?.blockingReasons ?? [];
	const executionReady = venue.readiness?.executionReady === true;
	return {
		wallets: { signer: null, maker: null, trading: null },
		tradingWalletDeployed: executionReady,
		identityReady: executionReady,
		regulatory: null,
		sorCanInclude: executionReady,
		blockingReasons: [...blocking],
	};
}

export function findVenueSetup(
	overview: AccountOverview | null | undefined,
	venue: VenueSetupLookupKey,
): VenueSetupSlice | null {
	const venueId = resolveOverviewVenueId(venue);
	const row = overview?.venues?.find((v) => v.venueId === venueId);
	if (!row) return null;
	return resolveVenueSetupFromSlice(row);
}

export function formatVenueSetupBlocking(setup: VenueSetupSlice | null): string {
	if (!setup) return "";
	if (setup.blockingReasons.length === 0) return "";
	return setup.blockingReasons.join(", ");
}

/** User-facing copy from `venues[].setup.blockingReasons` (mapped via readiness catalog). */
export function formatVenueSetupBlockingUserMessage(setup: VenueSetupSlice | null): string {
	if (!setup?.blockingReasons.length) return "";
	const mapped = blockingReasonsToMessages(setup.blockingReasons);
	return mapped.join(" ");
}
