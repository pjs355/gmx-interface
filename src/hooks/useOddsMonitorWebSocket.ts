import { useCallback, useEffect, useRef, useState } from "react";
import type {
	OddsMonitorAppState,
	OddsMonitorWsMessage,
} from "@/types/odds-monitor";

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

function nextReconnectDelayMs(attempt: number): number {
	const exp = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * Math.pow(2, attempt));
	const jitter = Math.random() * exp * 0.25;
	return Math.min(MAX_BACKOFF_MS, Math.floor(exp + jitter));
}

function isFullStateMessage(type: string): boolean {
	return type === "initial_state" || type === "state_update" || type === "state";
}

export interface UseOddsMonitorWebSocketResult {
	connected: boolean;
	appState: OddsMonitorAppState | null;
	lastWsError: string | null;
	enabled: boolean;
	sendGetState: () => void;
}

/**
 * Maintains full AppState snapshots from odds monitor WebSocket.
 * Reconnects with exponential backoff + jitter (cap 30s).
 */
export function useOddsMonitorWebSocket(
	wsUrl: string | null
): UseOddsMonitorWebSocketResult {
	const [connected, setConnected] = useState(false);
	const [appState, setAppState] = useState<OddsMonitorAppState | null>(null);
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

	const sendGetState = useCallback(() => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: "get_state" }));
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
			setAppState(null);
			setLastWsError(null);
			return;
		}

		const connect = () => {
			clearReconnectTimer();
			if (!shouldConnectRef.current || !wsUrl) {
				return;
			}

			try {
				const ws = new WebSocket(wsUrl);
				wsRef.current = ws;

				ws.onopen = () => {
					if (wsRef.current !== ws) return;
					setConnected(true);
					setLastWsError(null);
					reconnectAttemptRef.current = 0;
					ws.send(JSON.stringify({ type: "get_state" }));
				};

				ws.onmessage = (event) => {
					if (wsRef.current !== ws) return;
					try {
						const message = JSON.parse(
							event.data as string
						) as OddsMonitorWsMessage;
						if (message.type === "connection_status") {
							return;
						}
						if (
							message.type &&
							isFullStateMessage(message.type) &&
							message.data &&
							typeof message.data === "object"
						) {
							setAppState(message.data as OddsMonitorAppState);
						}
					} catch {
						setLastWsError("Failed to parse WebSocket message");
					}
				};

				ws.onerror = () => {
					setLastWsError("WebSocket error");
				};

				ws.onclose = (ev) => {
					if (wsRef.current === ws) {
						wsRef.current = null;
					}
					setConnected(false);

					let err: string | null = null;
					if (ev.code === 4401) {
						err =
							"Unauthorized — MONITOR_TOKEN in the shell that starts Vite must match the monitor server (or set VITE_ODDS_MONITOR_TOKEN in .env); restart `yarn dev` after changing it";
					} else if (ev.reason) {
						err = ev.reason;
					}
					if (err) {
						setLastWsError(err);
					}

					if (!shouldConnectRef.current) {
						return;
					}

					const attempt = reconnectAttemptRef.current;
					reconnectAttemptRef.current = attempt + 1;
					const delay = nextReconnectDelayMs(attempt);
					reconnectTimerRef.current = setTimeout(() => {
						connect();
					}, delay);
				};
			} catch {
				setLastWsError("Failed to create WebSocket");
				if (shouldConnectRef.current && wsUrl) {
					const attempt = reconnectAttemptRef.current;
					reconnectAttemptRef.current = attempt + 1;
					reconnectTimerRef.current = setTimeout(
						connect,
						nextReconnectDelayMs(attempt)
					);
				}
			}
		};

		connect();

		return () => {
			shouldConnectRef.current = false;
			clearReconnectTimer();
			const w = wsRef.current;
			wsRef.current = null;
			if (w) {
				w.close();
			}
		};
	}, [wsUrl]);

	return {
		connected,
		appState,
		lastWsError,
		enabled: Boolean(wsUrl),
		sendGetState,
	};
}
