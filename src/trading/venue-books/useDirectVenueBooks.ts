import { useState, useEffect, useRef, useCallback } from "react";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import { PolymarketBookClient } from "./polymarket-book-client";
import { DflowBookClient } from "./dflow-book-client";
import { venueBookToSnapshot } from "./orderbook-helpers";
import type { VenueBook } from "./types";

export interface DirectVenueBooks {
	polyBookA: OrderbookSnapshot | null;
	polyBookB: OrderbookSnapshot | null;
	dflowBookA: OrderbookSnapshot | null;
	dflowBookB: OrderbookSnapshot | null;
	polyConnected: boolean;
	dflowConnected: boolean;
	/** True when DFlow keyless WS failed and we should fall back to /ws/venue-prices */
	dflowFallback: boolean;
	/** True when Polymarket WS failed after connection attempts (geo-blocked or dead) */
	polyFailed: boolean;
}

const EMPTY: DirectVenueBooks = {
	polyBookA: null,
	polyBookB: null,
	dflowBookA: null,
	dflowBookB: null,
	polyConnected: false,
	dflowConnected: false,
	dflowFallback: false,
	polyFailed: false,
};

/**
 * Manages direct browser-native WebSocket connections to Polymarket and DFlow,
 * mapping incoming books to side A / side B using the MatchedMarket identifiers.
 *
 * Predict.fun stays on the server's /ws/venue-prices (API key required).
 * LevelUp's own book already connects directly via multiplex `/ws` on the trading page.
 */
export function useDirectVenueBooks(
	matched: MatchedMarket | null,
	options?: { disabled?: boolean },
): DirectVenueBooks {
	const disabled = Boolean(options?.disabled);

	const [polyBookA, setPolyBookA] = useState<OrderbookSnapshot | null>(null);
	const [polyBookB, setPolyBookB] = useState<OrderbookSnapshot | null>(null);
	const [dflowBookA, setDflowBookA] = useState<OrderbookSnapshot | null>(null);
	const [dflowBookB, setDflowBookB] = useState<OrderbookSnapshot | null>(null);
	const [polyConnected, setPolyConnected] = useState(false);
	const [polyFailed, setPolyFailed] = useState(false);
	const [dflowConnected, setDflowConnected] = useState(false);
	const [dflowFallback, setDflowFallback] = useState(false);

	// Stable refs to current token/ticker IDs for use in callbacks
	const polyTokenIdARef = useRef<string>("");
	const polyTokenIdBRef = useRef<string>("");
	const dflowTickerARef = useRef<string>("");
	const dflowTickerBRef = useRef<string>("");

	// Keep refs updated
	const polyTokenIdA = matched?.polyTokenIdA ?? "";
	const polyTokenIdB = matched?.polyTokenIdB ?? "";
	const dflowTickerA = matched?.dflow?.tickerA ?? "";
	const dflowTickerB = matched?.dflow?.tickerB ?? "";

	polyTokenIdARef.current = polyTokenIdA;
	polyTokenIdBRef.current = polyTokenIdB;
	dflowTickerARef.current = dflowTickerA;
	dflowTickerBRef.current = dflowTickerB;

	// --- Polymarket WS ---
	const polyClientRef = useRef<PolymarketBookClient | null>(null);

	const handlePolyBook = useCallback((tokenId: string, book: VenueBook) => {
		const snap = venueBookToSnapshot(book);
		if (tokenId === polyTokenIdARef.current) {
			setPolyBookA(snap);
		}
		if (tokenId === polyTokenIdBRef.current) {
			setPolyBookB(snap);
		}
	}, []);

	useEffect(() => {
		if (disabled) {
			setPolyBookA(null);
			setPolyBookB(null);
			setPolyConnected(false);
			setPolyFailed(false);
			polyClientRef.current?.disconnect();
			polyClientRef.current = null;
			return;
		}

		if (!polyTokenIdA && !polyTokenIdB) {
			setPolyBookA(null);
			setPolyBookB(null);
			setPolyConnected(false);
			setPolyFailed(false);
			return;
		}

		const client = new PolymarketBookClient({
			onBook: handlePolyBook,
			onConnect: () => {
				setPolyConnected(true);
				setPolyFailed(false);
			},
			onDisconnect: () => setPolyConnected(false),
			onError: (err) => {
				if (import.meta.env.DEV) console.warn("[PolymarketBookClient]", err.message);
			},
		});
		polyClientRef.current = client;

		client.setSubscribedTokenIds([polyTokenIdA, polyTokenIdB].filter(Boolean));
		client.connect();

		const fallbackCheck = setTimeout(() => {
			if (client.hasConnectionFailed() || client.isDead()) {
				setPolyFailed(true);
			}
		}, 5_000);

		return () => {
			clearTimeout(fallbackCheck);
			client.disconnect();
			polyClientRef.current = null;
		};
	}, [disabled, polyTokenIdA, polyTokenIdB, handlePolyBook]);

	// --- DFlow WS ---
	const dflowClientRef = useRef<DflowBookClient | null>(null);

	const handleDflowBook = useCallback((ticker: string, book: VenueBook) => {
		const snap = venueBookToSnapshot(book);
		if (ticker === dflowTickerARef.current) {
			setDflowBookA(snap);
		}
		if (ticker === dflowTickerBRef.current) {
			setDflowBookB(snap);
		}
	}, []);

	useEffect(() => {
		if (disabled) {
			setDflowBookA(null);
			setDflowBookB(null);
			setDflowConnected(false);
			setDflowFallback(false);
			dflowClientRef.current?.disconnect();
			dflowClientRef.current = null;
			return;
		}

		if (!dflowTickerA && !dflowTickerB) {
			setDflowBookA(null);
			setDflowBookB(null);
			setDflowConnected(false);
			setDflowFallback(false);
			return;
		}

		const client = new DflowBookClient({
			onBook: handleDflowBook,
			onConnect: () => {
				setDflowConnected(true);
				setDflowFallback(false);
			},
			onDisconnect: () => {
				setDflowConnected(false);
			},
			onError: (err) => {
				if (import.meta.env.DEV) console.warn("[DflowBookClient]", err.message);
				// If the keyless connection fails outright, flag fallback
				if (err.message.includes("keyless") || err.message.includes("timeout")) {
					setDflowFallback(true);
				}
			},
		});
		dflowClientRef.current = client;

		client.setSubscribedTickers([dflowTickerA, dflowTickerB].filter(Boolean));
		client.connect();

		// Check after a short delay if connection failed
		const fallbackCheck = setTimeout(() => {
			if (client.hasConnectionFailed() || client.isDead()) {
				setDflowFallback(true);
			}
		}, 5_000);

		return () => {
			clearTimeout(fallbackCheck);
			client.disconnect();
			dflowClientRef.current = null;
		};
	}, [disabled, dflowTickerA, dflowTickerB, handleDflowBook]);

	if (!matched || disabled) return EMPTY;

	return {
		polyBookA,
		polyBookB,
		dflowBookA,
		dflowBookB,
		polyConnected,
		dflowConnected,
		dflowFallback,
		polyFailed,
	};
}
