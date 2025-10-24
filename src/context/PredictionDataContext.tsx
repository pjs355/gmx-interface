import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	umbrellaDataService,
	type Umbrella,
} from "@/services/api/umbrellaDataService";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { OrderbookService } from "@/services/api/orderbookService";

type MarketLite = any;

type BookPreview = {
	lowestAsk: number | null;
	highestBid: number | null;
};

type PredictionDataContextValue = {
	umbrellas: Umbrella[];
	marketsByUmbrella: Record<string, MarketLite[]>;
	allMarketsByUmbrella: Record<string, MarketLite[]>;
	resolvedMarketsByUmbrella: Record<string, MarketLite[]>;
	allBooksPreview: Record<string, BookPreview>;
	// Legacy fields expected by existing pages/components
	singleMarketQuestions: Record<string, any>;
	singleMarketOrderbooks: Record<string, any>;
	multiMarketData: Record<string, any>;
	loading: boolean;
	booksPreviewLoading: boolean;
	error?: string;
	refresh: () => Promise<void>;
	// Helpers for consumers (e.g. trading page)
	getUmbrellaById: (umbrellaId: string) => Umbrella | undefined;
	getQuestionsForUmbrella: (umbrellaId: string) => any[];
	getAllQuestionsForUmbrella: (umbrellaId: string) => any[];
	getResolvedQuestionsForUmbrella: (umbrellaId: string) => any[];
	getOrderbookForQuestion: (
		umbrellaId: string,
		questionId: string
	) => any | null;
	refreshOrderbook: (umbrellaId: string, questionId: string) => Promise<void>;
};

const PredictionDataContext = createContext<PredictionDataContextValue>({
	umbrellas: [],
	marketsByUmbrella: {},
	allMarketsByUmbrella: {},
	resolvedMarketsByUmbrella: {},
	allBooksPreview: {},
	singleMarketQuestions: {},
	singleMarketOrderbooks: {},
	multiMarketData: {},
	loading: true,
	booksPreviewLoading: true,
	error: undefined,
	refresh: async () => {},
	getUmbrellaById: () => undefined,
	getQuestionsForUmbrella: () => [],
	getAllQuestionsForUmbrella: () => [],
	getResolvedQuestionsForUmbrella: () => [],
	getOrderbookForQuestion: () => null,
	refreshOrderbook: async () => {},
});

export function PredictionDataProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [loading, setLoading] = useState(false);
	const [umbrellas, setUmbrellas] = useState<Umbrella[]>([]);
	const [marketsByUmbrella, setMarketsByUmbrella] = useState<
		Record<string, MarketLite[]>
	>({});
	const [allMarketsByUmbrella, setAllMarketsByUmbrella] = useState<
		Record<string, MarketLite[]>
	>({});
	const [resolvedMarketsByUmbrella, setResolvedMarketsByUmbrella] = useState<
		Record<string, MarketLite[]>
	>({});
	const [singleMarketQuestions, setSingleMarketQuestions] = useState<
		Record<string, any>
	>({});
	const [singleMarketOrderbooks, setSingleMarketOrderbooks] = useState<
		Record<string, any>
	>({});
	const [multiMarketData, setMultiMarketData] = useState<Record<string, any>>(
		{}
	);
	const [allBooksPreview, setAllBooksPreview] = useState<
		Record<string, BookPreview>
	>({});
	const [booksPreviewLoading, setBooksPreviewLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	const load = useCallback(async () => {
		setLoading(true);
		setError(undefined);
		try {
			const umbrellas = await umbrellaDataService.fetchAllUmbrellas();
			const entries = await Promise.all(
				umbrellas.map(async (umbrella: any) => {
					const markets = umbrella.children;
					const key =
						umbrella?._id ||
						umbrella?.id ||
						umbrella?.slug ||
						JSON.stringify(umbrella);

					// Quiet detailed context debug counts to keep console clean

					// Filter out resolved markets here so downstream consumers never see them
					const filteredMarkets = Array.isArray(markets)
						? markets.filter(
								(m: any) =>
									String(m?.status ?? "").toLowerCase() !==
									"resolved"
						  )
						: [];
					// Provide a cleaned umbrella copy with filtered children for pages that read umbrella.children
					const cleanedUmbrella = {
						...umbrella,
						children: filteredMarkets,
					};
					return [
						key as string,
						filteredMarkets,
						cleanedUmbrella,
						markets,
					] as const;
				})
			);
			const marketsMap: Record<string, MarketLite[]> = {};
			const allMarketsMap: Record<string, MarketLite[]> = {};
			const resolvedMarketsMap: Record<string, MarketLite[]> = {};
			const singleQuestions: Record<string, any> = {};
			const orderbooks: Record<string, any> = {};
			const multiData: Record<string, any> = {};

			const cleanedUmbrellas: any[] = [];
			entries.forEach(([key, markets, cleanedUmbrella, allMarkets]) => {
				// Store all markets (including resolved) for consumers like Positions page (no re-fetch on mount)
				allMarketsMap[key] = allMarkets;

				// Store only resolved markets separately
				const resolvedMarkets = allMarkets.filter(
					(m: any) =>
						String(m?.status ?? "").toLowerCase() === "resolved"
				);
				if (resolvedMarkets.length > 0) {
					resolvedMarketsMap[key] = resolvedMarkets;
				}

				// Skip umbrellas that have no active markets left
				if (!Array.isArray(markets) || markets.length === 0) {
					return;
				}

				marketsMap[key] = markets;
				const isSingle = Array.isArray(markets) && markets.length === 1;
				if (isSingle) {
					singleQuestions[key] = markets[0];
				} else {
					// Legacy shape expected by utils: { questions: any[], orderbooks: { [id]: orderbook } }
					multiData[key] = {
						questions: markets,
						orderbooks: {},
					};
				}
				// Placeholder for orderbooks; keep empty object to avoid undefined lookups
				orderbooks[key] = orderbooks[key] || {};
				cleanedUmbrellas.push(cleanedUmbrella);
			});

			setUmbrellas(cleanedUmbrellas as any);
			setMarketsByUmbrella(marketsMap);
			setAllMarketsByUmbrella(allMarketsMap);
			setResolvedMarketsByUmbrella(resolvedMarketsMap);
			setSingleMarketQuestions(singleQuestions);
			setSingleMarketOrderbooks(orderbooks);
			setMultiMarketData(multiData);

			// Kick off orderbook and historical data fetches in background
		} catch (e: any) {
			setError(e?.message || "Failed to load markets");
		} finally {
			setLoading(false);
		}
	}, []);

	const getUmbrellaById = useCallback(
		(umbrellaId: string) => {
			return umbrellas.find((u: any) => u?._id === umbrellaId);
		},
		[umbrellas]
	);

	const getQuestionsForUmbrella = useCallback(
		(umbrellaId: string) => {
			const umbrellaMarkets = marketsByUmbrella[umbrellaId];
			if (Array.isArray(umbrellaMarkets)) return umbrellaMarkets as any[];
			const umbrella = getUmbrellaById(umbrellaId) as any;
			return umbrella && Array.isArray(umbrella.children)
				? umbrella.children
				: [];
		},
		[marketsByUmbrella, getUmbrellaById]
	);

	const getOrderbookForQuestion = useCallback(
		(umbrellaId: string, questionId: string) => {
			// single-market umbrella
			if (singleMarketQuestions[umbrellaId]) {
				const q = singleMarketQuestions[umbrellaId];
				const qid = q?._id || q?.questionId || q?.marketId;
				if (qid && qid === questionId) {
					return singleMarketOrderbooks[umbrellaId] || null;
				}
			}
			// multi-market umbrella
			const multi = multiMarketData[umbrellaId];
			if (multi && multi.orderbooks) {
				return multi.orderbooks[questionId] || null;
			}
			return null;
		},
		[singleMarketQuestions, singleMarketOrderbooks, multiMarketData]
	);

	const getAllQuestionsForUmbrella = useCallback(
		(umbrellaId: string) => {
			const all = allMarketsByUmbrella[umbrellaId];
			// Quiet getAllQuestionsForUmbrella debug log
			if (Array.isArray(all)) {
				// Quiet return count log
				return all as any[];
			}
			// fallback to active-only if all not present yet
			// Quiet fallback log
			return getQuestionsForUmbrella(umbrellaId);
		},
		[allMarketsByUmbrella, getQuestionsForUmbrella]
	);

	const getResolvedQuestionsForUmbrella = useCallback(
		(umbrellaId: string) => {
			const resolved = resolvedMarketsByUmbrella[umbrellaId];
			// Quiet resolved lookup log
			if (Array.isArray(resolved)) {
				// Quiet resolved return count log
				return resolved as any[];
			}
			// Quiet no resolved markets log
			return [];
		},
		[resolvedMarketsByUmbrella]
	);

	const refreshOrderbook = useCallback(
		async (umbrellaId: string, questionId: string) => {
			try {
				const orderbookService = new OrderbookService();
				const ob = await orderbookService.fetchOrderbook(questionId);
				if (!ob) return;
				// Decide which bucket to update
				if (singleMarketQuestions[umbrellaId]) {
					setSingleMarketOrderbooks((prev) => ({
						...prev,
						[umbrellaId]: ob,
					}));
				} else {
					setMultiMarketData((prev) => ({
						...prev,
						[umbrellaId]: {
							...(prev[umbrellaId] || {
								questions: getQuestionsForUmbrella(umbrellaId),
								orderbooks: {},
							}),
							orderbooks: {
								...((prev[umbrellaId] &&
									prev[umbrellaId].orderbooks) ||
									{}),
								[questionId]: ob,
							},
						},
					}));
				}
			} catch {
				// silent
			}
		},
		[singleMarketQuestions, getQuestionsForUmbrella]
	);

	useEffect(() => {
		load();
	}, [load]);

	// Fetch lightweight orderbook preview for all markets
	useEffect(() => {
		const fetchAllBooksPreview = async () => {
			try {
				const baseUrl = getPredictionApiBaseUrl();
				const response = await fetch(
					`${baseUrl}/api/all-books-preview`
				);
				if (!response.ok) {
					throw new Error(
						`Failed to fetch all-books-preview: ${response.status}`
					);
				}
				const json = await response.json();

				if (json.success && json.data) {
					// Transform array into object keyed by questionId
					const previewMap: Record<string, BookPreview> = {};
					if (Array.isArray(json.data)) {
						json.data.forEach((item: any) => {
							const qId = item.questionId;
							if (qId) {
								previewMap[qId] = {
									lowestAsk: item.lowestAsk ?? null,
									highestBid: item.highestBid ?? null,
								};
							}
						});
					}
					setAllBooksPreview(previewMap);
					setBooksPreviewLoading(false); // Mark as loaded
				}
			} catch (err) {
				console.error(
					"error",
					"Failed to fetch all-books-preview:",
					err
				);
				setBooksPreviewLoading(false); // Mark as loaded even on error
			}
		};

		fetchAllBooksPreview();
		// Refresh every 30 seconds
		const interval = setInterval(fetchAllBooksPreview, 30000);
		return () => clearInterval(interval);
	}, []);

	const value = useMemo<PredictionDataContextValue>(
		() => ({
			umbrellas,
			marketsByUmbrella,
			allMarketsByUmbrella,
			resolvedMarketsByUmbrella,
			allBooksPreview,
			singleMarketQuestions,
			singleMarketOrderbooks,
			multiMarketData,
			loading,
			booksPreviewLoading,
			error,
			refresh: load,
			getUmbrellaById,
			getQuestionsForUmbrella,
			getAllQuestionsForUmbrella,
			getResolvedQuestionsForUmbrella,
			getOrderbookForQuestion,
			refreshOrderbook,
		}),
		[
			umbrellas,
			marketsByUmbrella,
			allMarketsByUmbrella,
			resolvedMarketsByUmbrella,
			allBooksPreview,
			singleMarketQuestions,
			singleMarketOrderbooks,
			multiMarketData,
			loading,
			booksPreviewLoading,
			error,
			load,
			getUmbrellaById,
			getQuestionsForUmbrella,
			getAllQuestionsForUmbrella,
			getResolvedQuestionsForUmbrella,
			getOrderbookForQuestion,
			refreshOrderbook,
		]
	);

	return (
		<PredictionDataContext.Provider value={value}>
			{children}
		</PredictionDataContext.Provider>
	);
}

export function usePredictionData(): PredictionDataContextValue {
	return useContext(PredictionDataContext);
}
