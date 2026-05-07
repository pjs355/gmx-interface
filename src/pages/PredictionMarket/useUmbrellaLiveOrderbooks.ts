import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { getPredictionWebSocketUrl } from "@/config/predictionApiBase";
import {
	normalizeOrderbookPayload,
	hasUsableOrderbookSnapshot,
} from "./utils";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";

type GetOrderbookForQuestion = (
	umbrellaId: string,
	questionId: string,
) => unknown | null | undefined;

type RefreshOrderbook = (
	umbrellaId: string,
	questionId: string,
) => Promise<unknown | null>;

export function useUmbrellaLiveOrderbooks(
	umbrellaId: string | undefined,
	questions: PredictionMarket[],
	getOrderbookForQuestion: GetOrderbookForQuestion,
	_refreshOrderbook: RefreshOrderbook,
) {
	const [questionOrderbooks, setQuestionOrderbooks] = useState<
		Record<string, any>
	>({});
	const [orderbooksReady, setOrderbooksReady] = useState(false);
	const wsPayloadDevLoggedRef = useRef(new Set<string>());

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

	useEffect(() => {
		wsPayloadDevLoggedRef.current.clear();
	}, [marketIdsKey]);

	// Seed local map from context (same as PredictionMarket load path)
	useLayoutEffect(() => {
		if (!umbrellaId || !marketIdsKey) {
			setQuestionOrderbooks({});
			return;
		}
		const qids = marketIdsKey.split("|");
		const seeded: Record<string, unknown> = {};
		for (const qid of qids) {
			const ob = getOrderbookForQuestion(umbrellaId, qid);
			seeded[qid] = ob != null ? normalizeOrderbookPayload(ob) : ob;
		}
		setQuestionOrderbooks(seeded);
	}, [umbrellaId, marketIdsKey, getOrderbookForQuestion]);

	// Multiplex WebSocket
	useEffect(() => {
		if (!umbrellaId || !marketIdsKey) return;

		const wsBase = getPredictionWebSocketUrl().replace(/\/$/, "");
		const wsUrl = `${wsBase}/ws`;
		const receivedOrderbooks = new Set<string>();

		setOrderbooksReady(false);

		const expectedMarketIds = marketIdsKey.split("|");

		const applyOrderbookForMarket = (marketId: string, raw: unknown) => {
			const wrapped =
				raw && typeof raw === "object" && !Array.isArray(raw)
					? (raw as Record<string, unknown>)
					: null;
			const inner =
				wrapped?.snapshot ?? wrapped?.orderbook ?? wrapped?.data ?? raw;
			const orderbook = normalizeOrderbookPayload(inner);

			if (import.meta.env.DEV && !hasUsableOrderbookSnapshot(orderbook)) {
				const mid = String(marketId);
				if (!wsPayloadDevLoggedRef.current.has(mid)) {
					wsPayloadDevLoggedRef.current.add(mid);
					console.debug(
						"[PredictionMarket] multiplex WS orderbook not usable after normalize",
						{
							marketId: mid,
							rawKeys:
								inner &&
								typeof inner === "object" &&
								!Array.isArray(inner)
									? Object.keys(inner as object)
									: typeof inner,
						},
					);
				}
			}

			setQuestionOrderbooks((prev) => ({
				...prev,
				[marketId]: orderbook,
			}));
			receivedOrderbooks.add(marketId);
			if (receivedOrderbooks.size === expectedMarketIds.length) {
				setOrderbooksReady(true);
			}
		};

		const routeMessage = (message: unknown) => {
			if (!message || typeof message !== "object") return;
			const m = message as Record<string, unknown>;
			const t = m.type;
			if (
				t === "subscribed" ||
				t === "unsubscribed" ||
				t === "pong" ||
				t === "error"
			) {
				return;
			}

			const midRaw =
				m.market ?? m.questionId ?? m.question_id ?? m.conditionId;
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

		let ws: WebSocket;
		try {
			ws = new WebSocket(wsUrl);
		} catch (error) {
			console.error(
				"error",
				"Failed to create multiplex orderbook WebSocket:",
				error,
			);
			return;
		}

		ws.onopen = () => {
			for (const mid of expectedMarketIds) {
				try {
					ws.send(JSON.stringify({ type: "subscribe", market: mid }));
				} catch {
					/* ignore */
				}
			}
		};

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data as string);
				routeMessage(message);
			} catch (error) {
				console.error(
					"error",
					"Failed to parse multiplex WebSocket message:",
					error,
				);
			}
		};

		ws.onerror = (error) => {
			console.error("error", "Multiplex orderbook WebSocket error:", error);
		};

		const timeout = setTimeout(() => {
			if (!receivedOrderbooks.size) {
				setOrderbooksReady(true);
			}
		}, 5000);

		return () => {
			clearTimeout(timeout);
			if (ws.readyState === WebSocket.OPEN) {
				for (const mid of expectedMarketIds) {
					try {
						ws.send(JSON.stringify({ type: "unsubscribe", market: mid }));
					} catch {
						/* ignore */
					}
				}
			}
			ws.close();
		};
	}, [umbrellaId, marketIdsKey]);

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
