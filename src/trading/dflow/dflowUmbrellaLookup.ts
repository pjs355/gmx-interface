import type { Umbrella } from "@/services/api/umbrellaDataService";

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
