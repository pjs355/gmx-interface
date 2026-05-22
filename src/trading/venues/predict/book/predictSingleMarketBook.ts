import type { Book } from "@predictdotfun/sdk";
import type { MatchedMarket } from "@/types/odds-monitor";
import { predictOutcomeSide } from "../trade/predictOutcome";

/**
 * Which SOR outcome (A/B) the lone Predict REST/WS ladder is keyed to when
 * `predictFun.singleMarket` is true. Matches venue-pricing: native book on A
 * when only `marketIdA` is set, on B when only `marketIdB`, else A.
 */
export function predictSingleMarketNativeOutcomeSide(pf: {
	marketIdA?: string;
	marketIdB?: string;
}): "A" | "B" {
	const a = String(pf.marketIdA ?? "").trim();
	const b = String(pf.marketIdB ?? "").trim();
	if (a && !b) return "A";
	if (b && !a) return "B";
	return "A";
}

export function predictBookNeedsComplementForSorOutcome(
	matched: MatchedMarket | null | undefined,
	sorOutcome: "A" | "B",
): boolean {
	const pf = matched?.predictFun;
	if (!pf?.singleMarket) return false;
	return sorOutcome !== predictSingleMarketNativeOutcomeSide(pf);
}

export function predictBookNeedsComplementForPosition(
	matched: MatchedMarket | null | undefined,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): boolean {
	if (!matched?.predictFun?.singleMarket) return false;
	const sorOutcome = predictOutcomeSide(
		matched,
		position,
		yesTeamLabel,
		noTeamLabel,
	);
	return predictBookNeedsComplementForSorOutcome(matched, sorOutcome);
}

/**
 * Dual-YES complement for a Predict SDK book: mirror venue-pricing
 * `complementDualYesMatchBook` (opponent asks from our bids at `1 - price`, etc.).
 */
export function complementPredictOrderbook(book: Book): Book {
	const complementSide = (
		levels: [number, number][] | undefined,
		desc: boolean,
	): [number, number][] => {
		const out = (levels ?? [])
			.map(([p, q]) => [1 - Number(p), Number(q)] as [number, number])
			.filter(
				([p, q]) =>
					Number.isFinite(p) &&
					p > 0 &&
					p < 1 &&
					Number.isFinite(q) &&
					q > 0,
			);
		out.sort((a, b) => (desc ? b[0] - a[0] : a[0] - b[0]));
		return out;
	};

	return {
		...book,
		asks: complementSide(book.bids, false),
		bids: complementSide(book.asks, true),
	};
}
