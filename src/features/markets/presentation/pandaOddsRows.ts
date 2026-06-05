import type { PandaQuestionRow } from "./pandaMoneylineQuestion";

/**
 * One token-pair odds row for a Panda esports umbrella card: the series winner
 * plus each map that exists. `wireKey` matches the venue-prices / matched-markets
 * key the server streams (`matchId` for series, `matchId-map-N` for maps).
 */
export type PandaOddsRowSpec = {
	wireKey: string;
	label: string;
	/** null = series winner; N = map N. */
	slot: number | null;
};

function isOverUnderTemplate(template: string | undefined): boolean {
	const t = template?.trim();
	return t === "map-over-under" || t === "round-over-under";
}

/** null = series winner; N = map N. Mirrors predictions-api `resolveMapSlotFromQuestion`. */
function resolveMapSlot(q: PandaQuestionRow): number | null {
	const eventType = String(q.pandascore_eventType ?? "")
		.trim()
		.toLowerCase();
	const pos = q.pandascore_gamePosition;
	const hasPos = typeof pos === "number" && Number.isFinite(pos) && pos >= 1;
	if (eventType !== "game" && !hasPos) return null; // series winner
	return hasPos ? Math.trunc(pos) : null;
}

/**
 * Ordered odds rows for a Panda esports umbrella: series winner first, then each
 * map that exists (ascending). Over/under questions are excluded. Returns only the
 * rows that actually exist among the umbrella's questions.
 */
export function buildPandaOddsRowSpecs(
	matchId: string,
	questions: readonly PandaQuestionRow[] | null | undefined,
): PandaOddsRowSpec[] {
	const base = String(matchId ?? "").trim();
	if (!base || !questions?.length) return [];

	let hasSeries = false;
	const mapSlots = new Set<number>();
	for (const q of questions) {
		if (isOverUnderTemplate(q.pandascore_template)) continue;
		const slot = resolveMapSlot(q);
		if (slot === null) hasSeries = true;
		else mapSlots.add(slot);
	}

	const out: PandaOddsRowSpec[] = [];
	if (hasSeries) out.push({ wireKey: base, label: "Series Winner", slot: null });
	for (const slot of [...mapSlots].sort((a, b) => a - b)) {
		out.push({ wireKey: `${base}-map-${slot}`, label: `Map ${slot}`, slot });
	}
	return out;
}

/** Wire keys (series + maps) for the venue-prices subscription set. */
export function pandaVenueWireKeys(
	matchId: string,
	questions: readonly PandaQuestionRow[] | null | undefined,
): string[] {
	return buildPandaOddsRowSpecs(matchId, questions).map((s) => s.wireKey);
}
