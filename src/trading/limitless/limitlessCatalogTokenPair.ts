import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { canonicalLimitlessTokenId } from "@/trading/limitless/limitlessTokenId";

/** Minimal Limitless wire for token + per-leg slug inference (neg-risk: two CLOB markets). */
export type LimitlessInferenceWire = {
	tokenIdA: string;
	tokenIdB: string;
	orderbookSlugA?: string;
	orderbookSlugB?: string;
	/** Group / parent slug (`passion-ua-vs-sinners-…`) from catalog or monitor. */
	groupSlug?: string;
};

/** Strip trailing `-<digits>` segment (Limitless leg id suffix). */
function legSlugTeamKey(marketSlug: string): string {
	return marketSlug.replace(/-\d+$/, "").toLowerCase().trim();
}

/**
 * Map leg `eventSlug` to catalog Yes/No column using neg-risk **group** slug split on `-vs-`.
 * Example group `passion-ua-vs-sinners-1778554800949` vs legs `passion-ua-1778554800955` / `sinners-1778554800962`.
 */
export function inferCatalogSideFromNegRiskGroupSlug(
	legMarketSlug: string | undefined,
	groupSlug: string | undefined,
): boolean | null {
	const g = String(groupSlug ?? "").trim();
	const leg = String(legMarketSlug ?? "").trim();
	if (!g || !leg) return null;
	const parts = g.split(/-vs-/i);
	if (parts.length !== 2) return null;
	const kLeg = legSlugTeamKey(leg);
	const k0 = legSlugTeamKey(parts[0]!);
	const k1 = legSlugTeamKey(parts[1]!);
	if (kLeg && k0 && kLeg === k0) return true;
	if (kLeg && k1 && kLeg === k1) return false;
	return null;
}

/**
 * True when a venue row belongs to this catalog limitless leg: YES outcome mint **or**
 * per-market `eventSlug` equals `orderbookSlugA` / `orderbookSlugB` **or** same neg-risk
 * `limitlessGroupSlug` as `groupSlug` on the wire.
 */
export function limitlessPositionHitsCatalogLeg(
	pos: Pick<VenuePosition, "tokenId" | "eventSlug" | "limitlessGroupSlug">,
	lx: LimitlessInferenceWire,
): boolean {
	const tid = canonicalLimitlessTokenId(String(pos.tokenId ?? ""));
	const a = canonicalLimitlessTokenId(String(lx.tokenIdA));
	const b = canonicalLimitlessTokenId(String(lx.tokenIdB));
	const slug = String(pos.eventSlug ?? "").trim();
	const oa = String(lx.orderbookSlugA ?? "").trim();
	const ob = String(lx.orderbookSlugB ?? "").trim();
	if (tid && (tid === a || tid === b)) return true;
	const sLo = slug.toLowerCase();
	if (slug && ((oa && sLo === oa.toLowerCase()) || (ob && sLo === ob.toLowerCase())))
		return true;
	const posGroup = String(pos.limitlessGroupSlug ?? "").trim();
	const gSlug = String(lx.groupSlug ?? "").trim();
	if (
		posGroup &&
		gSlug &&
		posGroup.toLowerCase() === gSlug.toLowerCase()
	)
		return true;
	return false;
}

/**
 * Map position → catalog **Yes** column (`true`) vs **No** column (`false`).
 * Uses outcome mint first, then `orderbookSlugA` / `orderbookSlugB` vs `eventSlug`,
 * then neg-risk group slug vs leg market slug.
 */
export function inferLimitlessCatalogYesColumn(
	tokenIdRaw: string | undefined,
	eventSlugRaw: string | undefined,
	lx: LimitlessInferenceWire | null | undefined,
): boolean | null {
	if (!lx?.tokenIdA?.trim() || !lx?.tokenIdB?.trim()) return null;
	const tid = canonicalLimitlessTokenId(String(tokenIdRaw ?? ""));
	const a = canonicalLimitlessTokenId(String(lx.tokenIdA));
	const b = canonicalLimitlessTokenId(String(lx.tokenIdB));
	const slugPos = String(eventSlugRaw ?? "").trim();
	const oa = String(lx.orderbookSlugA ?? "").trim();
	const ob = String(lx.orderbookSlugB ?? "").trim();
	const sLo = slugPos.toLowerCase();
	/** Partner rows sometimes repeat the same outcome `tokenId` on both neg-risk legs — prefer per-leg slug. */
	if (slugPos && oa && sLo === oa.toLowerCase()) return true;
	if (slugPos && ob && sLo === ob.toLowerCase()) return false;
	if (tid && a && b) {
		if (tid === a && tid !== b) return true;
		if (tid === b && tid !== a) return false;
	}
	const fromGroup = inferCatalogSideFromNegRiskGroupSlug(slugPos, lx.groupSlug);
	if (fromGroup !== null) return fromGroup;
	return null;
}

/**
 * Find the catalog `exchangeMatching.limitless` token pair for a venue position
 * whose `tokenId` is one of the two outcome mints (dual-team CLOB: each team has its own market).
 * When `eventSlug` is set, also matches `orderbookSlugA` / `orderbookSlugB` so stale mint B
 * does not strand the sibling leg. Uses `limitlessGroupSlug` on `pos` when present.
 */
export function lookupLimitlessCatalogTokenPairForVenueToken(
	tokenIdRaw: string | undefined,
	umbrellas: Umbrella[],
	eventSlugRaw?: string | undefined,
	limitlessGroupSlugRaw?: string | undefined,
): LimitlessInferenceWire | null {
	const tid = canonicalLimitlessTokenId(String(tokenIdRaw ?? ""));
	const slugPos = String(eventSlugRaw ?? "").trim();
	const groupPos = String(limitlessGroupSlugRaw ?? "").trim();
	if (!tid && !slugPos && !groupPos) return null;
	for (const u of umbrellas) {
		const lx = u.exchangeMatching?.limitless;
		if (!lx?.tokenIdA?.trim() || !lx?.tokenIdB?.trim()) continue;
		const wire: LimitlessInferenceWire = {
			tokenIdA: lx.tokenIdA,
			tokenIdB: lx.tokenIdB,
			orderbookSlugA: lx.orderbookSlugA,
			orderbookSlugB: lx.orderbookSlugB,
			groupSlug: lx.slug,
		};
		if (
			limitlessPositionHitsCatalogLeg(
				{
					tokenId: tid || "",
					eventSlug: slugPos,
					limitlessGroupSlug: groupPos,
				},
				wire,
			)
		) {
			return wire;
		}
	}
	return null;
}
