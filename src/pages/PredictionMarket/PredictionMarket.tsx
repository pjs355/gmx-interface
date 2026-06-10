import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Trans } from "@lingui/macro";
import { useNavigate, useParams } from "react-router-dom";
import { useMedia } from "react-use";
import Button from "components/Button/Button";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { Umbrella, umbrellaDataService } from "@/services/api/umbrellaDataService";
import { usePredictionData } from "context/PredictionDataContext";
import GameLinks from "@/pages/Predictions/components/GameLinks";
import {
	getHomeGameFilter,
	setHomePendingGameFilter,
	setHomePendingWorldCupSection,
} from "@/pages/Predictions/utils/gameFilterNavigation";
import type { WorldCupSection } from "@/pages/Predictions/components/GameLinks";
import {
	isWorldCupPropUmbrella,
	isWorldCupUmbrella,
	WORLD_CUP_PILL_ID,
} from "@/pages/Predictions/utils/gameLinkFilters";
import { MarketPanels } from "./MarketPanels";
import { useUmbrellaLiveOrderbooks } from "./useUmbrellaLiveOrderbooks";
import { useVolumeSortedQuestions } from "./useVolumeSortedQuestions";
import { useChartState } from "./useChartState";
import { useMatchSettled } from "./useMatchSettled";
import {
	isThreeWayMoneylineQuestions,
	resolveThreeWayChartLegs,
} from "@/features/markets/listing/threeWayMoneyline";
import { getMarketId } from "./utils";
import { resolveEsportsLegs } from "@/features/markets/presentation/esportsLegs";
import {
	isMatchPropQuestion,
	matchPropSelectionTitle,
	partitionMatchPropQuestions,
} from "@/features/markets/listing/matchProps";
import { resolveDefaultTradeQuestion } from "@/features/markets/listing/defaultTradeQuestion";
import "../Predictions/Predictions.scss";
import "./scss/PredictionMarket.scss";
import { PredictionCurtainProvider } from "@/components/PredictionMarketTradeBox";
import { PageSkeleton } from "@/components/PageSkeleton/PageSkeleton";
import { useOddsFormatUrlSync } from "@/features/odds-display/useOddsFormatUrlSync";

function sanitizeUmbrellaQuestions(raw: unknown[]): PredictionMarket[] {
	return raw.filter(
		(q) => q && ((q as any)._id || (q as any).questionId || (q as any).marketId),
	) as PredictionMarket[];
}

function resolveQuestionsForUmbrella(
	umbrella: Umbrella,
	getQuestionsForUmbrella: (umbrellaId: string) => any[],
): PredictionMarket[] {
	const fromContext = getQuestionsForUmbrella(umbrella._id);
	if (Array.isArray(fromContext) && fromContext.length > 0) {
		return sanitizeUmbrellaQuestions(fromContext);
	}
	const children = (umbrella as { children?: unknown[] }).children;
	if (Array.isArray(children) && children.length > 0) {
		return sanitizeUmbrellaQuestions(children);
	}
	return [];
}

export default function PredictionMarket() {
	return <PredictionMarketContent />;
}

function PredictionMarketContent() {
	const { umbrellaId } = useParams<{ umbrellaId: string }>();
	useOddsFormatUrlSync();
	const navigate = useNavigate();
	const {
		umbrellas,
		getUmbrellaById,
		getQuestionsForUmbrella,
		getResolvedQuestionsForUmbrella,
		getOrderbookForQuestion,
		refreshOrderbook,
		loading: contextLoading,
	} = usePredictionData();

	/*
	 * Smooth home → umbrella navigation: when the user clicks a card on the
	 * home dock we already cached the umbrella in localStorage and the full
	 * umbrella + question list are also in `PredictionDataContext`. Resolve
	 * everything synchronously during the FIRST render so the right-side
	 * trade module can paint immediately, matching the dock visually with no
	 * skeleton flash and no "Umbrella Not Found" flicker. The existing
	 * `useEffect` below still handles direct-URL / refresh cases where the
	 * context loads after mount.
	 *
	 * Lazy initializers run in declaration order, so each one can read the
	 * `const` from the previous `useState(...)` line.
	 */
	const [umbrella, setUmbrella] = useState<Umbrella | null>(() => {
		const fromCtx = getUmbrellaById(umbrellaId || "");
		if (fromCtx) return fromCtx;
		try {
			const raw = localStorage.getItem("currentUmbrella");
			return raw ? (JSON.parse(raw) as Umbrella) : null;
		} catch {
			return null;
		}
	});
	const [questions, setQuestions] = useState<PredictionMarket[]>(() => {
		if (!umbrella?._id) return [];
		return resolveQuestionsForUmbrella(umbrella, getQuestionsForUmbrella);
	});
	/*
	 * `selectedMarketId` is set by Yes/No clicks on multi-market home cards.
	 * If it matches a cached question we can pick the right active market on
	 * the very first paint; otherwise we fall back to `questions[0]` (still
	 * better than `null` because `null` triggers the skeleton flash) and let
	 * the post-mount useEffect refine to the volume-sorted top market once
	 * orderbooks settle.
	 */
	const initialStoredMatch = useMemo<PredictionMarket | null>(() => {
		if (questions.length === 0) return null;
		const storedMarketId = localStorage.getItem("selectedMarketId");
		if (!storedMarketId) return null;
		const hit = questions.find((q) => {
			const qid = (q as any)._id || (q as any).questionId || (q as any).marketId;
			return qid === storedMarketId;
		});
		if (hit) {
			// Consume so the post-mount useEffect doesn't re-process.
			localStorage.removeItem("selectedMarketId");
			return hit;
		}
		return null;
		// Intentionally only run on mount — `questions` is the lazy-init value.
	}, []);
	const [activeMarket, setActiveMarket] = useState<PredictionMarket | null>(
		// Default: Team A moneyline — never a prop or the draw. Raw question order
		// can put a spread/total or Draw first.
		() => initialStoredMatch ?? resolveDefaultTradeQuestion(questions) ?? questions[0] ?? null,
	);
	const [activePosition, setActivePosition] = useState<"yes" | "no">(() => {
		// Only restore a stored position when restoring a stored market selection;
		// a fresh page open is always "Team A moneyline, Yes".
		if (!initialStoredMatch) return "yes";
		const storedPosition = localStorage.getItem("activePosition");
		return storedPosition === "yes" || storedPosition === "no" ? storedPosition : "yes";
	});
	/** Prop ladder cell title ("Mexico +1.5") — cleared when leaving props. */
	const [activeSelectionTitle, setActiveSelectionTitle] = useState<string | null>(null);
	const [hasUserSelectedMarket, setHasUserSelectedMarket] = useState(false);
	/*
	 * Only mark "stored selection processed" when we *actually* used a stored
	 * ID. For umbrella-card or "View more" navigations there's no stored ID,
	 * so leave this `false`: the post-mount selection effect will then refine
	 * `activeMarket` to the volume-sorted top market once orderbooks load
	 * (the trade box stays mounted across that change because it's keyed by
	 * `umbrella._id`, so no remount / skeleton flash).
	 */
	const [hasProcessedStoredSelection, setHasProcessedStoredSelection] = useState(() =>
		Boolean(initialStoredMatch),
	);
	const [loading, setLoading] = useState(() => !umbrella && contextLoading);
	const isMobile = useMedia("(max-width: 1100px)");
	const sidebarSelectedGame = getHomeGameFilter();
	const handleTradingSidebarSelect = useCallback(
		(game: string | null) => {
			setHomePendingGameFilter(game);
			navigate("/");
		},
		[navigate],
	);

	const handleTradingWorldCupSectionSelect = useCallback(
		(section: WorldCupSection) => {
			setHomePendingGameFilter(WORLD_CUP_PILL_ID);
			setHomePendingWorldCupSection(section);
			navigate("/");
		},
		[navigate],
	);

	const tradingWorldCupSection = useMemo((): WorldCupSection => {
		if (!umbrella) return "games";
		if (isWorldCupPropUmbrella(umbrella)) return "groups";
		if (isWorldCupUmbrella(umbrella)) return "games";
		return "games";
	}, [umbrella]);

	const tradingWorldCupSectionCounts = useMemo(() => {
		let games = 0;
		let groups = 0;
		for (const u of umbrellas) {
			if ((u as { active?: boolean }).active !== true) continue;
			if (!isWorldCupUmbrella(u)) continue;
			if (isWorldCupPropUmbrella(u)) groups += 1;
			else games += 1;
		}
		return { games, groups };
	}, [umbrellas]);
	const titleRef = useRef<HTMLHeadingElement | null>(null);
	const hasLogged = useRef<{ umbrella: boolean; markets: boolean }>({
		umbrella: false,
		markets: false,
	});
	// Removed tradeExecutionService - not used in this component

	useEffect(() => {
		const stored = localStorage.getItem("currentUmbrella");
		let parsed: Umbrella | null = null;
		try {
			parsed = stored ? JSON.parse(stored) : null;
		} catch {
			parsed = null;
		}

		const umbrellaFromContext = getUmbrellaById(umbrellaId || "") || parsed;
		if (!umbrellaFromContext) {
			setUmbrella(null);
			setQuestions([]);
			setLoading(false);
			return;
		}

		setUmbrella(umbrellaFromContext);
		const sanitized = resolveQuestionsForUmbrella(umbrellaFromContext, getQuestionsForUmbrella);
		if (sanitized.length === 0) {
			if (contextLoading) {
				setLoading(true);
				return;
			}
			// Check if markets are resolved before redirecting
			const resolvedQs = getResolvedQuestionsForUmbrella(umbrellaFromContext._id);
			if (resolvedQs.length > 0) {
				setQuestions([]);
				setLoading(false);
				return;
			}
			setQuestions([]);
			setLoading(false);
			navigate("/", { replace: true });
			return;
		}
		if (!hasLogged.current.markets) {
			hasLogged.current.markets = true;
		}
		setQuestions(sanitized);
		setLoading(false);
	}, [
		umbrellaId,
		umbrellas,
		contextLoading,
		// Removed function dependencies that cause infinite re-renders
		// getUmbrellaById, getQuestionsForUmbrella, getOrderbookForQuestion are stable
		navigate,
	]);

	/**
	 * Per-leg list for the multi-leg esports accordion (series + map_1 + map_2 + ...).
	 * Resolved from the umbrella's full child question list — INCLUDING `tradeable: false`
	 * map legs — so each leg can render as its own expandable section. Returns []
	 * for non-esports umbrellas or esports umbrellas with no map sub-questions, in
	 * which case the page renders the existing `MarketPanels` layout unchanged.
	 */
	const esportsLegs = useMemo(() => resolveEsportsLegs(umbrella, questions), [umbrella, questions]);
	const isMultiLegEsports = esportsLegs.length > 1;

	/**
	 * Split spread / total prop questions (trading-page-only carousel) from the
	 * core questions so the moneyline pipeline — pills, 3-way detection, chart,
	 * default market selection — never sees them.
	 */
	const { core: coreQuestions, props: matchPropQuestions } = useMemo(
		() => partitionMatchPropQuestions(questions),
		[questions],
	);

	/**
	 * Aggregator sub-markets (Map N winner, totals, …) carry `tradeable === false`
	 * and have no LevelUp order book / on-chain CTF.
	 *
	 * Default (single-question umbrellas, FIFA legs, esports moneyline-only): strip
	 * them out so the moneyline pipeline (orderbook fetch, volume sort, chart,
	 * trade box) is not polluted by view-only rows.
	 *
	 * Multi-leg esports (`isMultiLegEsports`): keep the map legs so each one can
	 * stream its own orderbook + drive the chart/trade box when its accordion
	 * section is expanded. The trade box handles "no LevelUp routing" gracefully
	 * (view-only sell strip) per the resolve helper docs.
	 *
	 * Spread / total props are excluded except for the one currently ACTIVE
	 * (selected in the props carousel): appending it keeps its orderbook
	 * streaming and stops the active-market safety net below from resetting
	 * the selection, without subscribing every line of every ladder.
	 */
	const moneylineQuestions = useMemo(() => {
		if (isMultiLegEsports) {
			const legIds = new Set<string>();
			for (const leg of esportsLegs) {
				const id = leg.question._id || leg.question.questionId || leg.question.marketId;
				if (typeof id === "string" && id.length > 0) legIds.add(id);
			}
			return questions.filter((q) => {
				const id = q._id || q.questionId || q.marketId;
				return typeof id === "string" && legIds.has(id);
			});
		}
		const core = coreQuestions.filter((q) => (q as { tradeable?: boolean }).tradeable !== false);
		if (activeMarket && isMatchPropQuestion(activeMarket)) {
			return [...core, activeMarket];
		}
		return core;
	}, [questions, coreQuestions, isMultiLegEsports, esportsLegs, activeMarket]);

	const { questionOrderbooks, orderbooksReady, fetchAllOrderbooks } = useUmbrellaLiveOrderbooks(
		umbrella?._id,
		moneylineQuestions,
		getOrderbookForQuestion,
		refreshOrderbook,
	);

	// Poll for THIS umbrella's updates every 60 seconds (e.g., streamEnabled toggled by cron)
	useEffect(() => {
		if (!umbrella?._id) return;

		const interval = setInterval(async () => {
			try {
				// Fetch only this specific umbrella using umbrellaDataService
				const updatedUmbrella = await umbrellaDataService.fetchUmbrellaById(umbrella._id);
				if (updatedUmbrella) {
					// Update local umbrella state with fresh data
					setUmbrella((prev) => ({
						...prev,
						...updatedUmbrella,
					}));
				}
			} catch (err) {
				console.error("Error polling umbrella:", err);
			}
		}, 60000); // 60 seconds

		return () => clearInterval(interval);
	}, [umbrella?._id]);

	// Mobile-only: ensure umbrella title fits within 3 lines by reducing font size as needed
	useEffect(() => {
		if (!isMobile) return;
		const el = titleRef.current;
		if (!el) return;

		const maxLines = 3;
		const maxFont = 34; // starting from text-34 intent
		const minFont = 16; // do not go below this for readability

		// Reset to max first
		el.style.fontSize = `${maxFont}px`;
		el.style.lineHeight = "1.2";
		el.style.display = "block";
		el.style.overflow = "hidden";

		const fits = () => {
			// Removed unused lineHeight calculation
			const computedLineHeight = parseFloat(getComputedStyle(el).lineHeight) || maxFont * 1.2;
			const maxHeight = computedLineHeight * maxLines;
			return el.scrollHeight <= maxHeight + 1; // small tolerance
		};

		let current = maxFont;
		// Try decreasing until it fits or we reach minFont
		while (current > minFont && !fits()) {
			current -= 1;
			el.style.fontSize = `${current}px`;
		}

		// On resize, re-run
		const handler = () => {
			// slight debounce via rAF
			requestAnimationFrame(() => {
				if (!titleRef.current) return;
				titleRef.current.style.fontSize = `${maxFont}px`;
				let c = maxFont;
				while (c > minFont && !fits()) {
					c -= 1;
					titleRef.current!.style.fontSize = `${c}px`;
				}
			});
		};

		window.addEventListener("resize", handler);
		return () => window.removeEventListener("resize", handler);
	}, [isMobile, umbrella?.displayName]);

	function resolvePropSelectionTitle(
		market: PredictionMarket,
		position: "yes" | "no",
		selectionTitle?: string | null,
	): string | null {
		const marketType = (market as { marketType?: unknown }).marketType;
		if (marketType === "spread" || marketType === "total") {
			return matchPropSelectionTitle(market, position, umbrella?.teamMappings);
		}
		return selectionTitle?.trim() || null;
	}

	// Function to switch active market and position when Trade Yes/No is clicked
	const handleMarketSwitch = useCallback(
		(market: PredictionMarket, position: "yes" | "no", selectionTitle?: string | null) => {
			setActiveMarket(market);
			setActivePosition(position);
			setActiveSelectionTitle(resolvePropSelectionTitle(market, position, selectionTitle));
			setHasUserSelectedMarket(true);
		},
		[umbrella?.teamMappings],
	);

	// Function to update just the position (for trading box callbacks)
	const handlePositionChange = useCallback(
		(position: "yes" | "no") => {
			setActivePosition(position);
			setActiveSelectionTitle((prev) => {
				const marketType = activeMarket
					? (activeMarket as { marketType?: unknown }).marketType
					: undefined;
				if (!activeMarket || (marketType !== "spread" && marketType !== "total")) {
					return prev;
				}
				return matchPropSelectionTitle(activeMarket, position, umbrella?.teamMappings);
			});
		},
		[activeMarket, umbrella?.teamMappings],
	);

	// Function to handle market switch with orderbook opening (for Yes/No button clicks)
	const handleMarketSwitchWithOrderbook = useCallback(
		(market: PredictionMarket, position: "yes" | "no", selectionTitle?: string | null) => {
			setActiveMarket(market);
			setActivePosition(position);
			setActiveSelectionTitle(resolvePropSelectionTitle(market, position, selectionTitle));
			setHasUserSelectedMarket(true); // Mark as user-selected to prevent auto-reset
		},
		[umbrella?.teamMappings],
	);

	// Get the active market's orderbook
	const activeMarketOrderbook = useMemo(() => {
		if (!activeMarket) return null;
		const orderBookId = activeMarket._id || activeMarket.questionId || activeMarket.marketId;
		const orderbook = questionOrderbooks[orderBookId] || null;
		return orderbook;
	}, [activeMarket, questionOrderbooks]);

	/**
	 * Mirror the umbrella's pin + active market into the home dock keys so a
	 * round-trip (home → umbrella → home) keeps the exact same market focused
	 * in the home trade widget. The keys are owned by `HomeInlineTradeLayout`
	 * (see comments there); this just keeps them in sync from the detail page.
	 */
	useEffect(() => {
		if (!umbrella?._id) return;
		try {
			localStorage.setItem("homeDockPinnedUmbrellaId", umbrella._id);
			const id = activeMarket
				? (activeMarket as any)._id ||
					(activeMarket as any).questionId ||
					(activeMarket as any).marketId ||
					""
				: "";
			if (id) {
				localStorage.setItem("homeDockActiveMarketId", id);
			}
		} catch {
			/* localStorage unavailable */
		}
	}, [umbrella?._id, activeMarket]);

	// Update the live ask store with the active market's best ask price
	useEffect(() => {
		if (activeMarketOrderbook?.asks && activeMarketOrderbook.asks.length > 0) {
			// Removed unused bestAsk calculation
			// NOTE: Live ask store is now managed separately for chart independence
			// The chart has its own live ask management that doesn't depend on activeMarket
		}
	}, [activeMarketOrderbook, activeMarket]);

	const sortedQuestions = useVolumeSortedQuestions(
		moneylineQuestions,
		questionOrderbooks,
		orderbooksReady,
	);

	// COMPLETELY ISOLATED CHART STATE - Never changes after initial load
	// Chart state managed by useChartState hook

	// Helper function to get consistent market ID
	const getMarketId = useCallback((market: any) => {
		if (!market) return "";
		return market._id || market.questionId || market.marketId || "";
	}, []);

	// Handle initial market selection from stored data or default to top market
	useEffect(() => {
		if (!hasUserSelectedMarket && !hasProcessedStoredSelection && sortedQuestions.length > 0) {
			setHasProcessedStoredSelection(true);

			// Check for stored market ID from navigation
			const storedMarketId = localStorage.getItem("selectedMarketId");
			let targetMarket: PredictionMarket | null = null;

			if (storedMarketId) {
				// Find the market with the stored ID
				targetMarket =
					sortedQuestions.find((question) => {
						const marketId = question._id || question.questionId || question.marketId;
						return marketId === storedMarketId;
					}) || null;

				// Clear the stored market ID after using it
				localStorage.removeItem("selectedMarketId");
			}

			// If no stored market found, default to Team A moneyline (volume order
			// can put the Draw or a deep prop book first).
			if (!targetMarket) {
				targetMarket = resolveDefaultTradeQuestion(sortedQuestions) ?? sortedQuestions[0];
			}

			// Set the target market as active
			if (
				targetMarket &&
				(!activeMarket || getMarketId(activeMarket) !== getMarketId(targetMarket))
			) {
				setActiveMarket(targetMarket);
			}
		}
	}, [
		hasUserSelectedMarket,
		hasProcessedStoredSelection,
		sortedQuestions,
		activeMarket,
		getMarketId,
	]);

	/**
	 * Guarantees a non-null `activeMarket` whenever we have markets — `UmbrellaTradeBoxPanel`
	 * shows an indefinite `TradeBoxSkeleton` when `activeMarket` is null. The selection effect
	 * above can miss (e.g. `hasProcessedStoredSelection` already true after StrictMode, or race
	 * with `sortedQuestions` hydration), so this is a cheap safety net.
	 */
	useEffect(() => {
		if (sortedQuestions.length === 0) return;
		const fallback = resolveDefaultTradeQuestion(sortedQuestions) ?? sortedQuestions[0];
		if (activeMarket != null) {
			const id = getMarketId(activeMarket);
			if (!id) {
				setActiveMarket(fallback);
				return;
			}
			const stillInUmbrella = sortedQuestions.some((q) => getMarketId(q) === id);
			if (!stillInUmbrella) {
				setActiveMarket(fallback);
			}
			return;
		}
		setActiveMarket(fallback);
	}, [sortedQuestions, activeMarket, getMarketId]);

	/**
	 * For multi-leg Panda esports umbrellas (series + maps) default the active leg
	 * to Moneyline (series), regardless of which leg has the most volume. Mirrors
	 * the user-facing rule "Moneyline is open by default". Only fires when the
	 * user hasn't picked a market yet — direct deep-links (`selectedMarketId` in
	 * localStorage) and explicit accordion clicks both win.
	 */
	useEffect(() => {
		if (!isMultiLegEsports) return;
		if (hasUserSelectedMarket) return;
		const seriesLeg = esportsLegs.find((leg) => leg.slot === null);
		if (!seriesLeg) return;
		const seriesId = getMarketId(seriesLeg.question);
		if (!seriesId) return;
		if (activeMarket && getMarketId(activeMarket) === seriesId) return;
		setActiveMarket(seriesLeg.question);
	}, [isMultiLegEsports, hasUserSelectedMarket, esportsLegs, activeMarket, getMarketId]);

	/**
	 * The "active leg" question for multi-leg esports. In single-leg / FIFA / Polymarket
	 * paths this is unused; in multi-leg esports it is the question whose accordion
	 * section is currently expanded (drives chart + orderbook + trade box).
	 */
	const accordionActiveQuestion = useMemo<PredictionMarket | null>(() => {
		if (!isMultiLegEsports) return null;
		if (activeMarket) return activeMarket;
		return esportsLegs[0]?.question ?? null;
	}, [isMultiLegEsports, activeMarket, esportsLegs]);

	// Chart input: always the match moneyline — never spreads/totals or esports map
	// legs. For 3-way FIFA always Team A (home) YES + Team B (away) YES — never
	// the Draw leg and never whichever team pill the user last clicked.
	const chartQuestions = useMemo(() => {
		if (isMultiLegEsports) {
			const seriesLeg = esportsLegs.find((leg) => leg.slot === null);
			return seriesLeg ? [seriesLeg.question] : [];
		}
		const core = coreQuestions.filter(
			(q) => !isMatchPropQuestion(q) && (q as { tradeable?: boolean }).tradeable !== false,
		);
		if (isThreeWayMoneylineQuestions(core)) {
			return resolveThreeWayChartLegs(core);
		}
		// Stable core order — never volume sort or the active spread/total leg.
		return core;
	}, [isMultiLegEsports, esportsLegs, coreQuestions, getMarketId]);

	// Hooks must be called unconditionally on every render
	const chartOnlyState = useChartState(chartQuestions as any[], questionOrderbooks);

	/**
	 * `sortedQuestions` for `MarketPanels` in multi-leg esports mode: restricted to
	 * the currently expanded leg so MarketPanels' internal question pill strip
	 * (which would duplicate the accordion's navigation), 3-way / group-winner
	 * detection, and chart/orderbook routing all narrow to a single question.
	 * Single-leg / FIFA / Polymarket paths pass through unchanged.
	 */
	const panelSortedQuestions = useMemo<PredictionMarket[]>(() => {
		if (isMultiLegEsports) {
			return accordionActiveQuestion ? [accordionActiveQuestion] : [];
		}
		return sortedQuestions;
	}, [isMultiLegEsports, accordionActiveQuestion, sortedQuestions]);

	const pandascoreMatchIdRaw =
		typeof umbrella?.pandascore_matchId === "string" ? umbrella.pandascore_matchId.trim() : "";
	const settledInfo = useMatchSettled(
		umbrella?._id,
		pandascoreMatchIdRaw || undefined,
		umbrella
			? {
					pandascore_matchId: umbrella.pandascore_matchId,
					displayName: umbrella.displayName,
					teamMappings: umbrella.teamMappings,
				}
			: null,
	);

	if (!umbrella && (loading || contextLoading)) {
		return <PageSkeleton />;
	}

	// Show error page if umbrella is explicitly null after loading
	if (!loading && !umbrella) {
		return (
			<div className="default-container page-layout">
				<div className="mb-2">
					<h1 className="mb-16 text-34 font-bold">
						<Trans>Umbrella Not Found</Trans>
					</h1>
					<p className="error-message">Please navigate to this page from the Predictions list.</p>
					<Button
						variant="primary"
						onClick={() => navigate("/")}
						style={{
							padding: "12px 24px",
							fontSize: "16px",
							marginTop: "16px",
						}}
					>
						← Back to Predictions
					</Button>
				</div>
			</div>
		);
	}

	/**
	 * For multi-leg esports umbrellas the accordion lives *inside* `MarketPanels`
	 * (replacing the moneyline-odds heading + cross-venue table slot) so the
	 * chart at the top and the sticky trade box on the right keep their fixed
	 * desktop positions instead of being relocated under each accordion leg.
	 * MarketPanels reads `esportsLegs` and renders the accordion itself when
	 * `isMultiLegEsports` is true.
	 */
	const marketPanelsNode = (
		<MarketPanels
			umbrella={umbrella!}
			titleRef={titleRef}
			sortedQuestions={panelSortedQuestions as any}
			questionOrderbooks={questionOrderbooks}
			activeMarket={(accordionActiveQuestion ?? activeMarket) as any}
			activePosition={activePosition}
			activeSelectionTitle={activeSelectionTitle}
			onMarketSwitch={handleMarketSwitch}
			onMarketSwitchWithOrderbook={handleMarketSwitchWithOrderbook}
			onPositionChange={handlePositionChange}
			fetchAllOrderbooks={fetchAllOrderbooks}
			chartState={chartOnlyState}
			settledInfo={settledInfo}
			esportsLegs={isMultiLegEsports ? esportsLegs : undefined}
			matchProps={matchPropQuestions}
		/>
	);

	return (
		<PredictionCurtainProvider>
			<div className={`prediction-market-page ${isMobile ? "mobile" : "desktop"}`}>
				{isMobile ? (
					marketPanelsNode
				) : (
					<div className="predictions-markets-body">
						<GameLinks
							selectedGame={sidebarSelectedGame}
							onGameSelect={handleTradingSidebarSelect}
							umbrellas={umbrellas}
							loading={contextLoading}
							filterType="all"
							disableFilterToggle
							worldCupSection={tradingWorldCupSection}
							onWorldCupSectionSelect={handleTradingWorldCupSectionSelect}
							worldCupSectionCounts={tradingWorldCupSectionCounts}
						/>
						{marketPanelsNode}
					</div>
				)}
			</div>
		</PredictionCurtainProvider>
	);
}
