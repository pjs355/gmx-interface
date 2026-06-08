import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { isPandaEsportsUmbrella } from "./pandaMoneylineQuestion";

/**
 * One row in the umbrella detail page's leg accordion. The series winner is
 * always first (slot === null, label "Moneyline"); per-map legs follow in
 * ascending slot order. `wireKey` matches the venue-prices / matched-markets
 * key the server emits (`${pandaMatchId}` for series, `${pandaMatchId}-map-${slot}`
 * for maps), see {@link buildPandaOddsRowSpecs}.
 */
export interface EsportsLeg {
	/** null = series winner; N = map N. */
	slot: number | null;
	/** "Moneyline" for series; "Map 1" / "Map 2" / ... for maps. */
	label: string;
	/** Question to set as `activeMarket` when this leg is expanded. */
	question: PredictionMarket;
	/** Venue-prices wire key broadcast by the server for this leg. */
	wireKey: string;
}

function isOverUnderTemplate(template: string | undefined): boolean {
	const t = template?.trim();
	return t === "map-over-under" || t === "round-over-under";
}

/**
 * null = series winner; N = map N. Mirrors predictions-api
 * `resolveMapSlotFromQuestion` and the home card's `resolveMapSlot` so the
 * accordion's per-leg classification matches the backend's wire-key fan-out.
 */
function resolveMapSlot(q: PredictionMarket): number | null {
	const eventType = String(q.pandascore_eventType ?? "")
		.trim()
		.toLowerCase();
	const pos = q.pandascore_gamePosition;
	const hasPos = typeof pos === "number" && Number.isFinite(pos) && pos >= 1;
	if (eventType !== "game" && !hasPos) return null;
	return hasPos ? Math.trunc(pos) : null;
}

function pandascoreMatchId(umbrella: Umbrella | null | undefined): string {
	const raw = (umbrella as { pandascore_matchId?: unknown } | null | undefined)?.pandascore_matchId;
	return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Ordered legs for a Panda esports umbrella's trading-page accordion: series
 * winner first (slot === null), then each map that exists in ascending slot
 * order. Over/under templates are excluded (no team-vs-team binary book).
 *
 * Unlike the home-page row specs ({@link buildPandaOddsRowSpecs}), this resolver
 * keeps `tradeable: false` map legs — they render in the accordion as view-only
 * sections with live odds, and the trade box gracefully no-ops when LevelUp
 * routing is absent. Series-only umbrellas return `[series]` and the accordion
 * caller falls through to the existing MarketPanels layout.
 */
export function resolveEsportsLegs(
	umbrella: Umbrella | null | undefined,
	allQuestions: readonly PredictionMarket[] | null | undefined,
): EsportsLeg[] {
	if (!umbrella || !isPandaEsportsUmbrella(umbrella)) return [];
	const matchId = pandascoreMatchId(umbrella);
	if (!matchId || !allQuestions?.length) return [];

	let seriesQuestion: PredictionMarket | null = null;
	const mapQuestionBySlot = new Map<number, PredictionMarket>();
	for (const q of allQuestions) {
		if (!q) continue;
		if (isOverUnderTemplate(q.pandascore_template)) continue;
		const slot = resolveMapSlot(q);
		if (slot === null) {
			// Prefer the first series question encountered (mirrors backend
			// canonical-winner selection — there is only one for an esports umbrella).
			if (!seriesQuestion) seriesQuestion = q;
			continue;
		}
		if (!mapQuestionBySlot.has(slot)) {
			mapQuestionBySlot.set(slot, q);
		}
	}

	const out: EsportsLeg[] = [];
	if (seriesQuestion) {
		out.push({
			slot: null,
			label: "Moneyline",
			question: seriesQuestion,
			wireKey: matchId,
		});
	}
	for (const slot of [...mapQuestionBySlot.keys()].sort((a, b) => a - b)) {
		const question = mapQuestionBySlot.get(slot);
		if (!question) continue;
		out.push({
			slot,
			label: `Map ${slot}`,
			question,
			wireKey: `${matchId}-map-${slot}`,
		});
	}
	return out;
}
