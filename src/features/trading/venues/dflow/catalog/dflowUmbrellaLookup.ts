import type { Umbrella } from "@/services/api/umbrellaDataService";

export { portfolioColumnTeamLabels } from "@/features/markets/presentation/outcomeSideLabels";

/** `exchangeMatching.dflow` on umbrellas / matched-markets (yes + optional no mints per side). */
type DflowExchangeWire = {
	yesMintA?: unknown;
	yesMintB?: unknown;
	noMintA?: unknown;
	noMintB?: unknown;
};

/**
 * Mongo / WS payloads should use base58 strings; coerce defensively so a stray number or
 * other type never makes `value?.trim()` evaluate to `undefined` and then get invoked as
 * `undefined()` (throws — can blank the whole app during History/Positions render).
 */
export function coerceDflowMintField(v: unknown): string {
	if (typeof v !== "string") return "";
	const t = v.trim();
	return t;
}

function dflowWireMints(d: unknown): string[] {
	if (!d || typeof d !== "object") return [];
	const w = d as DflowExchangeWire;
	const out: string[] = [];
	for (const k of ["yesMintA", "yesMintB", "noMintA", "noMintB"] as const) {
		const m = coerceDflowMintField(w[k]);
		if (m) out.push(m);
	}
	return out;
}

/** True if `mint` matches any known outcome mint on the umbrella's `exchangeMatching.dflow`. */
export function mintMatchesDflowExchange(dflowWire: unknown, mint: string): boolean {
	const m = mint.trim();
	if (!m) return false;
	for (const x of dflowWireMints(dflowWire)) {
		if (x === m) return true;
	}
	return false;
}

/** Canonical key for event-ticker maps / lookups (Kalshi-style tickers are case-insensitive). */
export function normalizeDflowEventTickerKey(s: string): string {
	return s.trim().toUpperCase();
}

function readDflowWireForEventLookup(d: unknown): {
	eventTickerRaw: string;
	tickerA: string;
	tickerB: string;
} {
	if (!d || typeof d !== "object") {
		return { eventTickerRaw: "", tickerA: "", tickerB: "" };
	}
	const w = d as Record<string, unknown>;
	const et =
		(typeof w.eventTicker === "string" ? w.eventTicker : "") ||
		(typeof w.event_ticker === "string" ? w.event_ticker : "");
	const tickerA = typeof w.tickerA === "string" ? w.tickerA.trim() : "";
	const tickerB = typeof w.tickerB === "string" ? w.tickerB.trim() : "";
	return {
		eventTickerRaw: et.trim(),
		tickerA,
		tickerB,
	};
}

function addInferredKalshiEventParents(ticker: string, add: (k: string) => void): void {
	if (!ticker) return;
	const cut = ticker.lastIndexOf("-");
	if (cut <= 0) return;
	const inferred = ticker.slice(0, cut);
	if (inferred) add(inferred);
}

/**
 * True when `etNorm` is {@link normalizeDflowEventTickerKey} of a venue history / position
 * `dflowEventTicker` and matches this umbrella's DFlow wire (exact event id, full leg tickers,
 * or Kalshi leg prefix `eventId-`).
 */
export function dflowWireMatchesEventTicker(etNorm: string, dflowWire: unknown): boolean {
	if (!etNorm) return false;
	const { eventTickerRaw, tickerA, tickerB } = readDflowWireForEventLookup(dflowWire);
	if (normalizeDflowEventTickerKey(eventTickerRaw) === etNorm) return true;
	const a = normalizeDflowEventTickerKey(tickerA);
	const b = normalizeDflowEventTickerKey(tickerB);
	const p = `${etNorm}-`;
	return a === etNorm || b === etNorm || a.startsWith(p) || b.startsWith(p);
}

/**
 * Map lookup then linear scan — same rules as {@link dflowWireMatchesEventTicker}.
 */
export function lookupUmbrellaByDflowEventTicker(
	eventTickerRaw: string,
	byEventTicker: Map<string, Umbrella> | null | undefined,
	umbrellas: Umbrella[],
): Umbrella | null {
	const et = normalizeDflowEventTickerKey(eventTickerRaw);
	if (!et) return null;
	const fromMap = byEventTicker?.get(et);
	if (fromMap) return fromMap;
	for (const u of umbrellas) {
		if (dflowWireMatchesEventTicker(et, u.exchangeMatching?.dflow)) return u;
	}
	return null;
}

/**
 * Index umbrellas by `exchangeMatching.dflow.eventTicker` (Kalshi/DFlow event id).
 * Last umbrella wins if multiple rows share the same ticker (same as mint index).
 */
export function buildUmbrellaLookupByDflowEventTicker(
	umbrellas: Umbrella[],
): Map<string, Umbrella> {
	const map = new Map<string, Umbrella>();
	for (const umb of umbrellas) {
		const d = umb.exchangeMatching?.dflow;
		if (!d || typeof d !== "object") continue;
		const { eventTickerRaw, tickerA, tickerB } = readDflowWireForEventLookup(d);
		const add = (raw: string) => {
			const k = normalizeDflowEventTickerKey(raw);
			if (k) map.set(k, umb);
		};
		if (eventTickerRaw) add(eventTickerRaw);
		if (tickerA) {
			add(tickerA);
			addInferredKalshiEventParents(tickerA, add);
		}
		if (tickerB) {
			add(tickerB);
			addInferredKalshiEventParents(tickerB, add);
		}
	}
	return map;
}

/**
 * Index umbrellas by DFlow/Kalshi outcome mint (`VenuePosition.tokenId` on `venue: "dflow"`).
 * Used for:
 * - Positions: `matchVenuePositionToUmbrella` / `buildUnmatchedVenueUmbrellas` (catalog `displayName`)
 * - History: `venueHistory` row patch + `matchVenuePositionToUmbrellaForHistory` grouping
 * - Trade box: `umbrellaForPosition` when attributing venue shares to the open umbrella
 *
 * Requires catalog umbrellas to carry `exchangeMatching.dflow` yes/no mints aligned with monitor.
 */
export function buildUmbrellaLookupByDflowOutcomeMint(
	umbrellas: Umbrella[],
): Map<string, Umbrella> {
	const map = new Map<string, Umbrella>();
	for (const umb of umbrellas) {
		const mints = dflowWireMints(umb.exchangeMatching?.dflow);
		for (const mint of mints) {
			map.set(mint, umb);
		}
	}
	return map;
}

/**
 * Portfolio columns = first vs second team on the umbrella (`teamMappings` / display title).
 *
 * Kalshi exposes **four** SPLs (YES/NO × team A leg × team B leg). They collapse to **two** buckets:
 * **YES A + NO B** pay together (A wins → portfolio **Yes**); **NO A + YES B** pay together (B wins → portfolio **No**).
 *
 * Wire: Mongo `exchangeMatching.dflow` — **yesMintA** / **noMintB** → portfolio **Yes**; **noMintA** / **yesMintB** → **No**.
 * {@link patchDflowVenuePositionOutcomes} uses this map as the **only** mint → column remap for UI.
 */
export function buildDflowPortfolioColumnMapFromCatalog(
	umbrellas: Umbrella[],
): Map<string, "Yes" | "No"> {
	const out = new Map<string, "Yes" | "No">();
	for (const u of umbrellas) {
		const d = u.exchangeMatching?.dflow;
		if (!d || typeof d !== "object") continue;
		const w = d as DflowExchangeWire;
		const assign = (mintRaw: unknown, col: "Yes" | "No") => {
			const m = coerceDflowMintField(mintRaw);
			if (m) out.set(m, col);
		};
		assign(w.yesMintA, "Yes");
		assign(w.noMintA, "No");
		assign(w.yesMintB, "No");
		assign(w.noMintB, "Yes");
	}
	return out;
}

/**
 * When any seed mint appears on an umbrella’s `exchangeMatching.dflow`, union in **all** wire
 * mints (`yesMintA`/`noMintA`/`yesMintB`/`noMintB`). Ensures we still query Solana for co-listed legs
 * if trade history only mentioned one outcome mint (common when splitting fills across txs).
 */
export function expandDflowMintsWithCoListedLegs(
	seedMints: readonly string[],
	umbrellas: Umbrella[],
): string[] {
	const seed = new Set(seedMints.map((m) => m.trim()).filter(Boolean));
	const out = new Set(seed);
	for (const u of umbrellas) {
		const d = u.exchangeMatching?.dflow;
		if (!d || typeof d !== "object") continue;
		const w = d as DflowExchangeWire;
		const legs: string[] = [];
		for (const k of ["yesMintA", "yesMintB", "noMintA", "noMintB"] as const) {
			const m = coerceDflowMintField(w[k]);
			if (m) legs.push(m);
		}
		if (legs.length === 0) continue;
		if (!legs.some((m) => seed.has(m))) continue;
		for (const m of legs) out.add(m);
	}
	return [...out];
}

/**
 * Every Solana outcome mint listed on any umbrella `exchangeMatching.dflow`
 * (`yesMintA` / `yesMintB` / `noMintA` / `noMintB`). Same source as
 * {@link stableDflowUmbrellaMintCatalogSig}; use for drift checks vs wallet balances.
 */
export function collectAllDflowCatalogWireMints(umbrellas: Umbrella[]): Set<string> {
	const m = new Set<string>();
	for (const u of umbrellas) {
		const d = u.exchangeMatching?.dflow;
		if (!d || typeof d !== "object") continue;
		const w = d as DflowExchangeWire;
		for (const k of ["yesMintA", "yesMintB", "noMintA", "noMintB"] as const) {
			const x = coerceDflowMintField(w[k]);
			if (x) m.add(x);
		}
	}
	return m;
}

/**
 * Stable fingerprint for React Query — refetch on-chain DFlow reads when any catalog mint on an
 * umbrella’s `exchangeMatching.dflow` changes (so co-listed leg expansion stays in sync).
 */
export function stableDflowUmbrellaMintCatalogSig(umbrellas: Umbrella[]): string {
	return [...collectAllDflowCatalogWireMints(umbrellas)].sort().join("\0");
}
