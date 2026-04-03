import { useCallback, useEffect, useRef, useState } from "react";
import type { VenuePriceSnapshot } from "@/types/venue-prices";

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

function nextReconnectDelayMs(attempt: number): number {
	const exp = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * Math.pow(2, attempt));
	const jitter = Math.random() * exp * 0.25;
	return Math.min(MAX_BACKOFF_MS, Math.floor(exp + jitter));
}

export interface UseVenuePriceWebSocketResult {
	connected: boolean;
	prices: Map<string, VenuePriceSnapshot[]>;
	lastWsError: string | null;
	enabled: boolean;
	subscribe: (pandaMatchId: string) => void;
	unsubscribe: (pandaMatchId: string) => void;
}

export function useVenuePriceWebSocket(
	wsUrl: string | null
): UseVenuePriceWebSocketResult {
	const [connected, setConnected] = useState(false);
	const [prices, setPrices] = useState<Map<string, VenuePriceSnapshot[]>>(new Map());
	const [lastWsError, setLastWsError] = useState<string | null>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const reconnectAttemptRef = useRef(0);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const shouldConnectRef = useRef(true);

	const clearReconnectTimer = () => {
		if (reconnectTimerRef.current !== null) {
			clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}
	};

	const subscribe = useCallback((pandaMatchId: string) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: "subscribe", pandaMatchId }));
		}
	}, []);

	const unsubscribe = useCallback((pandaMatchId: string) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: "unsubscribe", pandaMatchId }));
		}
	}, []);

	useEffect(() => {
		shouldConnectRef.current = true;

		if (!wsUrl) {
			clearReconnectTimer();
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
			setConnected(false);
			setPrices(new Map());
			setLastWsError(null);
			return;
		}

		const connect = () => {
			clearReconnectTimer();
			if (!shouldConnectRef.current || !wsUrl) return;

			try {
				const ws = new WebSocket(wsUrl);
				wsRef.current = ws;

				ws.onopen = () => {
					if (wsRef.current !== ws) return;
					setConnected(true);
					setLastWsError(null);
					reconnectAttemptRef.current = 0;
				};

				ws.onmessage = (event) => {
					if (wsRef.current !== ws) return;
					try {
						const message = JSON.parse(event.data as string);
						if (message.type === "venue_prices" && Array.isArray(message.data)) {
							const snapshots: VenuePriceSnapshot[] = message.data;
							setPrices((prev) => {
								const next = new Map(prev);
								for (const snap of snapshots) {
									const existing = next.get(snap.pandaMatchId) ?? [];
									const idx = existing.findIndex((s) => s.venue === snap.venue);
									if (idx >= 0) {
										existing[idx] = snap;
									} else {
										existing.push(snap);
									}
									next.set(snap.pandaMatchId, [...existing]);
								}
								return next;
							});
						}
					} catch {
						setLastWsError("Failed to parse venue price message");
					}
				};

				ws.onerror = () => {
					setLastWsError("Venue price WebSocket error");
				};

				ws.onclose = () => {
					if (wsRef.current === ws) wsRef.current = null;
					setConnected(false);

					if (!shouldConnectRef.current) return;
					const attempt = reconnectAttemptRef.current;
					reconnectAttemptRef.current = attempt + 1;
					const delay = nextReconnectDelayMs(attempt);
					reconnectTimerRef.current = setTimeout(connect, delay);
				};
			} catch {
				setLastWsError("Failed to create WebSocket");
				if (shouldConnectRef.current && wsUrl) {
					const attempt = reconnectAttemptRef.current;
					reconnectAttemptRef.current = attempt + 1;
					reconnectTimerRef.current = setTimeout(connect, nextReconnectDelayMs(attempt));
				}
			}
		};

		connect();

		return () => {
			shouldConnectRef.current = false;
			clearReconnectTimer();
			const w = wsRef.current;
			wsRef.current = null;
			if (w) w.close();
		};
	}, [wsUrl]);

	return { connected, prices, lastWsError, enabled: Boolean(wsUrl), subscribe, unsubscribe };
}
