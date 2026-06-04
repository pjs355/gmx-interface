import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

/** Display order for a 3-way moneyline: Team A win, Team B win, Draw. */
const LEG_ORDER: Record<string, number> = { home: 0, away: 1, draw: 2 };

function isMoneylineLeg(value: unknown): value is "home" | "away" | "draw" {
	return value === "home" || value === "away" || value === "draw";
}

/**
 * True when an umbrella's display questions form a 3-way moneyline (Team A win /
 * Draw / Team B win) — e.g. FIFA World Cup. Detected purely from the per-leg
 * `moneylineLeg` field (the only signal reliably present on both legacy
 * `category: "moneyline"` and newer `marketType: "moneyline"` rows), so it works
 * for any future 3-way sport.
 */
export function isThreeWayMoneylineQuestions(
	questions: PredictionMarket[] | null | undefined,
): boolean {
	if (!Array.isArray(questions)) return false;
	const legs = new Set<string>();
	for (const q of questions) {
		if (isMoneylineLeg(q?.moneylineLeg)) {
			legs.add(q.moneylineLeg);
		}
	}
	return legs.has("home") && legs.has("draw") && legs.has("away");
}

/** Return the 3 legs ordered Team A win, Draw, Team B win (drops non-moneyline rows). */
export function orderThreeWayLegs(questions: PredictionMarket[]): PredictionMarket[] {
	return questions
		.filter((q) => isMoneylineLeg(q?.moneylineLeg))
		.sort(
			(a, b) =>
				(LEG_ORDER[a.moneylineLeg as string] ?? 99) - (LEG_ORDER[b.moneylineLeg as string] ?? 99),
		);
}

/** Neutral grey for the Draw outcome — it is not a team, so it gets no team color. */
export const DRAW_COLOR = "#9ca3af";

/**
 * YES color for a 3-way leg: the team's color for home/away, neutral grey for
 * Draw (button + odds bar). Falls back to green when a team color is missing.
 */
export function threeWayLegColor(question: PredictionMarket): string {
	if (question.moneylineLeg === "draw") return DRAW_COLOR;
	const raw = (question as { yesColor?: unknown })?.yesColor;
	return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : "#22c55e";
}

/** Concise outcome label for a 3-way leg row (Team name, or "Draw"). */
export function threeWayLegLabel(question: PredictionMarket): string {
	if (question.moneylineLeg === "draw") return "Draw";
	// Polymarket question reads "Will <Team> win on <date>?" — the reliable team signal.
	const q = (question.question || "").trim();
	const winMatch = q.match(/^Will\s+(.+?)\s+win\b/i);
	if (winMatch?.[1]) return winMatch[1].trim();
	// Fallback: displayName is "<Team A> vs <Team B> — <Team>"; take the segment after the last " — ".
	const display = (question.displayName || "").trim();
	const dashIdx = display.lastIndexOf(" — ");
	if (dashIdx !== -1) {
		const tail = display.slice(dashIdx + 3).trim();
		if (tail) return tail;
	}
	return display || q;
}
