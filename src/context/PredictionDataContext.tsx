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
import { OrderbookService } from "@/services/api/orderbookService";
import { tagService, type Tag } from "@/services/api/tagService";

/** Avoid an infinite home skeleton when `fetch` hangs (no browser timeout on stalled TCP). */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
		}, ms);
	});
	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timer !== undefined) clearTimeout(timer);
	}) as Promise<T>;
}

const UMBRELLAS_FETCH_TIMEOUT_MS = 60_000;
const TAGS_FETCH_TIMEOUT_MS = 30_000;

type MarketLite = any;

type BookPreview = {
	lowestAsk: number | null;
	highestBid: number | null;
	bestYesPrice: number | null;
	bestNoPrice: number | null;
};

type PredictionDataContextValue = {
	umbrellas: Umbrella[];
	marketsByUmbrella: Record<string, MarketLite[]>;
	allMarketsByUmbrella: Record<string, MarketLite[]>;
	resolvedMarketsByUmbrella: Record<string, MarketLite[]>;
	allBooksPreview: Record<string, BookPreview>;
	tags: Tag[];
	tagsLoading: boolean;
	/**
	 * Set when the `/tags` request fails. `tagService.fetchAllTags()` used to
	 * silently return `[]` on error, which made the filter UI look broken with
	 * no diagnostic. Consumers can show a "tags unavailable" hint or just hide
	 * the filter when this is non-null.
	 */
	tagsError: string | null;
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
	refreshOrderbook: (
		umbrellaId: string,
		questionId: string
	) => Promise<any | null>;
};

const PredictionDataContext = createContext<PredictionDataContextValue>({
	umbrellas: [],
	marketsByUmbrella: {},
	allMarketsByUmbrella: {},
	resolvedMarketsByUmbrella: {},
	allBooksPreview: {},
	tags: [],
	tagsLoading: true,
	tagsError: null,
	singleMarketQuestions: {},
	singleMarketOrderbooks: {},
	multiMarketData: {},
	loading: true,
	booksPreviewLoading: false,
	error: undefined,
	refresh: async () => {},
	getUmbrellaById: () => undefined,
	getQuestionsForUmbrella: () => [],
	getAllQuestionsForUmbrella: () => [],
	getResolvedQuestionsForUmbrella: () => [],
	getOrderbookForQuestion: () => null,
	refreshOrderbook: async () => null,
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
	const [tags, setTags] = useState<Tag[]>([]);
	const [tagsLoading, setTagsLoading] = useState(true);
	const [tagsError, setTagsError] = useState<string | null>(null);
	const [error, setError] = useState<string | undefined>(undefined);

	const hasDataRef = React.useRef(false);
	const load = useCallback(async () => {
		// Only show loading spinner on initial load, not on SWR background refresh
		if (!hasDataRef.current) setLoading(true);
		setError(undefined);
		try {
			const umbrellas = await withTimeout(
				umbrellaDataService.fetchAllUmbrellas(),
				UMBRELLAS_FETCH_TIMEOUT_MS,
				"Markets catalog (GET /umbrellas)",
			);
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
					// Provide a cleaned umbrella copy with filtered children for backward compatibility
					// Store original children separately for image/tag resolution
					const cleanedUmbrella = {
						...umbrella,
						children: filteredMarkets, // Filtered for backward compatibility with existing components
						originalChildren: markets, // Keep original unfiltered children for image resolution (has tagIds)
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

				// Always add umbrella to cleanedUmbrellas so getUmbrellaById works for resolved-only umbrellas
				cleanedUmbrellas.push(cleanedUmbrella);

				// Skip market data processing for umbrellas that have no active markets left
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
			});

			setUmbrellas(cleanedUmbrellas as any);
			setMarketsByUmbrella(marketsMap);
			setAllMarketsByUmbrella(allMarketsMap);
			setResolvedMarketsByUmbrella(resolvedMarketsMap);
			setSingleMarketQuestions(singleQuestions);
			setSingleMarketOrderbooks(orderbooks);
			setMultiMarketData(multiData);
			hasDataRef.current = true;
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
				if (!ob) return null;
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
				return ob;
			} catch {
				return null;
			}
		},
		[singleMarketQuestions, getQuestionsForUmbrella]
	);

	useEffect(() => {
		load();
	}, [load]);

	// Re-process when background SWR refresh delivers fresh umbrella data
	useEffect(() => {
		const unsubscribe = umbrellaDataService.onRefresh(() => {
			load();
		});
		return unsubscribe;
	}, [load]);

	// Fetch tags from tagService.
	// Module-level in-flight ref so React 18 StrictMode's double-mount doesn't
	// fire two parallel `/tags` requests (matches the `hasDataRef` pattern
	// already used by the umbrellas effect above).
	const tagsInFlightRef = React.useRef<Promise<Tag[]> | null>(null);
	useEffect(() => {
		let mounted = true;

		async function fetchTags() {
			try {
				if (!tagsInFlightRef.current) {
					tagsInFlightRef.current = tagService.fetchAllTags();
				}
				const fetchedTags = await withTimeout(
					tagsInFlightRef.current,
					TAGS_FETCH_TIMEOUT_MS,
					"Game filters (GET /tags)",
				);
				if (mounted) {
					setTags(fetchedTags);
					setTagsLoading(false);
					setTagsError(null);
				}
			} catch (err) {
				console.error("Failed to fetch tags:", err);
				if (mounted) {
					setTags([]);
					setTagsLoading(false);
					setTagsError(err instanceof Error ? err.message : String(err));
				}
			} finally {
				tagsInFlightRef.current = null;
			}
		}

		fetchTags();

		return () => {
			mounted = false;
		};
	}, []);

	const value = useMemo<PredictionDataContextValue>(
		() => ({
			umbrellas,
			marketsByUmbrella,
			allMarketsByUmbrella,
			resolvedMarketsByUmbrella,
			allBooksPreview: {} as Record<string, BookPreview>,
			tags,
			tagsLoading,
			tagsError,
			singleMarketQuestions,
			singleMarketOrderbooks,
			multiMarketData,
			loading,
			booksPreviewLoading: false,
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
			tags,
			tagsLoading,
			tagsError,
			singleMarketQuestions,
			singleMarketOrderbooks,
			multiMarketData,
			loading,
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
