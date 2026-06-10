import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { getPredictionWebSocketUrl } from "@/config/predictionApiBase";
import { normalizeOrderbookPayload, hasUsableOrderbookSnapshot } from "./utils";

type GetOrderbookForQuestion = (
	umbrellaId: string,
	questionId: string,
) => unknown | null | undefined;

type RefreshOrderbook = (umbrellaId: string, questionId: string) => Promise<unknown | null>;

function parseMarketIdsKey(marketIdsKey: string): string[] {
	if (!marketIdsKey) return [];
	return marketIdsKey.split("|").filter(Boolean);
}

export function useUmbrellaLiveOrderbooks(
	umbrellaId: string | undefined,
	questions: PredictionMarket[],
	getOrderbookForQuestion: GetOrderbookForQuestion,
	_refreshOrderbook: RefreshOrderbook,
) {
	const [questionOrderbooks, setQuestionOrderbooks] = useState<Record<string, any>>({});
	const [orderbooksReady, setOrderbooksReady] = useState(false);
	const wsPayloadDevLoggedRef = useRef(new Set<string>());
	const wsRef = useRef<WebSocket | null>(null);
	const subscribedIdsRef = useRef<Set<string>>(new Set());
	const receivedOrderbooksRef = useRef<Set<string>>(new Set());
	const expectedMarketIdsRef = useRef<string[]>([]);
	const wsUmbrellaIdRef = useRef<string | undefined>(undefined);

	const marketIdsKey = useMemo(
		() =>
			[...questions]
				.map((q) => q._id || q.questionId || q.marketId)
				.filter(Boolean)
				.map((id) => String(id))
				.sort()
				.join("|"),
		[questions],
	);

	const expectedMarketIds = useMemo(() => parseMarketIdsKey(marketIdsKey), [marketIdsKey]);

	useEffect(() => {
		wsPayloadDevLoggedRef.current.clear();
	}, [marketIdsKey]);

	const markReadyIfComplete = useCallback((expected: string[]) => {
		if (expected.length === 0) {
			setOrderbooksReady(true);
			return;
		}
		if (receivedOrderbooksRef.current.size >= expected.length) {
			setOrderbooksReady(true);
		}
	}, []);

	// Seed from context — merge into existing books so adding a spread leg does not wipe moneyline snapshots.
	useLayoutEffect(() => {
		if (!umbrellaId || expectedMarketIds.length === 0) {
			setQuestionOrderbooks({});
			setOrderbooksReady(false);
			return;
		}

		setQuestionOrderbooks((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const qid of expectedMarketIds) {
				if (hasUsableOrderbookSnapshot(next[qid])) continue;
				const ob = getOrderbookForQuestion(umbrellaId, qid);
				if (ob == null) continue;
				const normalized = normalizeOrderbookPayload(ob);
				if (next[qid] !== normalized) {
					next[qid] = normalized;
					changed = true;
					if (hasUsableOrderbookSnapshot(normalized)) {
						receivedOrderbooksRef.current.add(qid);
					}
				}
			}
			return changed ? next : prev;
		});
		markReadyIfComplete(expectedMarketIds);
	}, [umbrellaId, expectedMarketIds, getOrderbookForQuestion, markReadyIfComplete]);

	const applyOrderbookForMarket = useCallback(
		(marketId: string, raw: unknown) => {
			const wrapped =
				raw && typeof raw === "object" && !Array.isArray(raw)
					? (raw as Record<string, unknown>)
					: null;
			const inner = wrapped?.snapshot ?? wrapped?.orderbook ?? wrapped?.data ?? raw;
			const orderbook = normalizeOrderbookPayload(inner);

			if (import.meta.env.DEV && !hasUsableOrderbookSnapshot(orderbook)) {
				const mid = String(marketId);
				if (!wsPayloadDevLoggedRef.current.has(mid)) {
					wsPayloadDevLoggedRef.current.add(mid);
					console.debug("[PredictionMarket] multiplex WS orderbook not usable after normalize", {
						marketId: mid,
						rawKeys:
							inner && typeof inner === "object" && !Array.isArray(inner)
								? Object.keys(inner as object)
								: typeof inner,
					});
				}
			}

			setQuestionOrderbooks((prev) => ({
				...prev,
				[marketId]: orderbook,
			}));
			receivedOrderbooksRef.current.add(marketId);
			markReadyIfComplete(expectedMarketIdsRef.current);
		},
		[markReadyIfComplete],
	);

	const subscribeMarkets = useCallback((ids: string[]) => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		for (const mid of ids) {
			if (subscribedIdsRef.current.has(mid)) continue;
			try {
				ws.send(JSON.stringify({ type: "subscribe", market: mid }));
				subscribedIdsRef.current.add(mid);
			} catch {
				/* ignore */
			}
		}
	}, []);

	const unsubscribeMarkets = useCallback((ids: string[]) => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		for (const mid of ids) {
			if (!subscribedIdsRef.current.has(mid)) continue;
			try {
				ws.send(JSON.stringify({ type: "unsubscribe", market: mid }));
				subscribedIdsRef.current.delete(mid);
			} catch {
				/* ignore */
			}
		}
	}, []);

	// One socket per umbrella; subscribe/unsubscribe incrementally when the market set changes.
	useEffect(() => {
		if (!umbrellaId || expectedMarketIds.length === 0) return;

		const wsBase = getPredictionWebSocketUrl().replace(/\/$/, "");
		const wsUrl = `${wsBase}/ws`;
		let wsErrorLogged = false;

		const routeMessage = (message: unknown) => {
			if (!message || typeof message !== "object") return;
			const m = message as Record<string, unknown>;
			const t = m.type;
			if (t === "subscribed" || t === "unsubscribed" || t === "pong" || t === "error") {
				return;
			}

			const midRaw = m.market ?? m.questionId ?? m.question_id ?? m.conditionId;
			if (typeof midRaw === "string" && midRaw) {
				applyOrderbookForMarket(midRaw, m.snapshot ?? m.orderbook ?? m);
				return;
			}

			const markets = m.markets;
			if (Array.isArray(markets)) {
				for (const item of markets) {
					if (!item || typeof item !== "object") continue;
					const row = item as Record<string, unknown>;
					const id = row.market ?? row.questionId ?? row.conditionId;
					if (typeof id === "string" && id) {
						applyOrderbookForMarket(id, row.snapshot ?? row.orderbook ?? row);
					}
				}
			}
		};

		const umbrellaChanged = wsUmbrellaIdRef.current !== umbrellaId;
		if (umbrellaChanged) {
			wsUmbrellaIdRef.current = umbrellaId;
			if (wsRef.current) {
				try {
					wsRef.current.close();
				} catch {
					/* ignore */
				}
				wsRef.current = null;
			}
			subscribedIdsRef.current = new Set();
			receivedOrderbooksRef.current = new Set();
			setOrderbooksReady(false);
		}

		const prevExpected = expectedMarketIdsRef.current;
		const prevSet = new Set(prevExpected);
		const nextSet = new Set(expectedMarketIds);
		const toUnsub = prevExpected.filter((id) => !nextSet.has(id));
		const toSub = expectedMarketIds.filter((id) => !prevSet.has(id));
		expectedMarketIdsRef.current = expectedMarketIds;

		let ws = wsRef.current;
		if (!ws || ws.readyState === WebSocket.CLOSED) {
			try {
				ws = new WebSocket(wsUrl);
			} catch (error) {
				console.error("error", "Failed to create multiplex orderbook WebSocket:", error);
				return;
			}
			wsRef.current = ws;

			ws.onopen = () => {
				subscribeMarkets(expectedMarketIds);
			};

			ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data as string);
					routeMessage(message);
				} catch (error) {
					console.error("error", "Failed to parse multiplex WebSocket message:", error);
				}
			};

			ws.onerror = () => {
				if (wsErrorLogged) return;
				wsErrorLogged = true;
				if (import.meta.env.DEV) {
					console.debug(
						"[PredictionMarket] multiplex orderbook WebSocket unavailable (using REST/context books)",
						wsUrl,
					);
				}
			};
		} else if (ws.readyState === WebSocket.OPEN) {
			unsubscribeMarkets(toUnsub);
			subscribeMarkets(toSub);
			markReadyIfComplete(expectedMarketIds);
		} else if (ws.readyState === WebSocket.CONNECTING) {
			const priorOnOpen = ws.onopen;
			ws.onopen = (ev) => {
				priorOnOpen?.call(ws, ev);
				unsubscribeMarkets(toUnsub);
				subscribeMarkets(toSub);
				markReadyIfComplete(expectedMarketIds);
			};
		}

		const timeout = setTimeout(() => {
			if (receivedOrderbooksRef.current.size === 0) {
				setOrderbooksReady(true);
			}
		}, 5000);

		return () => {
			clearTimeout(timeout);
		};
	}, [
		umbrellaId,
		expectedMarketIds,
		applyOrderbookForMarket,
		subscribeMarkets,
		unsubscribeMarkets,
		markReadyIfComplete,
	]);

	useEffect(() => {
		return () => {
			if (wsRef.current) {
				try {
					wsRef.current.close();
				} catch {
					/* ignore */
				}
				wsRef.current = null;
			}
		};
	}, [umbrellaId]);

	const fetchAllOrderbooks = useCallback(
		async (qs: PredictionMarket[]) => {
			if (!umbrellaId) return;
			const updated: Record<string, unknown> = {};
			for (const q of qs || []) {
				const qid =
					(q as { _id?: string })._id ||
					(q as { questionId?: string }).questionId ||
					(q as { marketId?: string }).marketId;
				if (!qid) continue;
				const sid = String(qid);
				const ob = getOrderbookForQuestion(umbrellaId, sid);
				if (ob != null) updated[sid] = normalizeOrderbookPayload(ob);
			}
			setQuestionOrderbooks((prev) => ({ ...prev, ...updated }));
		},
		[umbrellaId, getOrderbookForQuestion],
	);

	return {
		questionOrderbooks,
		setQuestionOrderbooks,
		orderbooksReady,
		fetchAllOrderbooks,
	};
}
