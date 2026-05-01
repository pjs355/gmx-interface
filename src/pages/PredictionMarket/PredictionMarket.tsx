import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Trans } from "@lingui/macro";
import { useNavigate, useParams } from "react-router-dom";
import { useMedia } from "react-use";
import Button from "components/Button/Button";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	Umbrella,
	umbrellaDataService,
} from "@/services/api/umbrellaDataService";
import { usePredictionData } from "context/PredictionDataContext";
import { MarketPanels } from "./MarketPanels";
import { useUmbrellaLiveOrderbooks } from "./useUmbrellaLiveOrderbooks";
import { useVolumeSortedQuestions } from "./useVolumeSortedQuestions";
import { useChartState } from "./useChartState";
import { MarketHeader } from "./MarketHeader";
import { useMatchSettled } from "./useMatchSettled";
import "./PredictionMarket.scss";
import { PredictionCurtainProvider } from "./PredictionMarketTradeBox/PredictionCurtain";
import { hasUsableOrderbookSnapshot } from "./utils";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

export default function PredictionMarket() {
	return <PredictionMarketContent />;
}

function PredictionMarketContent() {
	const { umbrellaId } = useParams<{ umbrellaId: string }>();
	const navigate = useNavigate();
	const [umbrella, setUmbrella] = useState<Umbrella | null>(null);
	const [questions, setQuestions] = useState<PredictionMarket[]>([]);
	const [activeMarket, setActiveMarket] = useState<PredictionMarket | null>(
		null
	);
	const [activePosition, setActivePosition] = useState<"yes" | "no">(() => {
		// Read activePosition from localStorage, default to 'yes' if not found
		const storedPosition = localStorage.getItem("activePosition");
		return storedPosition === "yes" || storedPosition === "no"
			? storedPosition
			: "yes";
	});
	const [hasUserSelectedMarket, setHasUserSelectedMarket] = useState(false);
	const [hasProcessedStoredSelection, setHasProcessedStoredSelection] =
		useState(false);
	const [loading, setLoading] = useState(true);
	const isMobile = useMedia("(max-width: 1100px)");
	const titleRef = useRef<HTMLHeadingElement | null>(null);
	const hasLogged = useRef<{ umbrella: boolean; markets: boolean }>({
		umbrella: false,
		markets: false,
	});
	const {
		umbrellas,
		getUmbrellaById,
		getQuestionsForUmbrella,
		getResolvedQuestionsForUmbrella,
		getOrderbookForQuestion,
		refreshOrderbook,
		loading: contextLoading,
		refresh: refreshContext,
	} = usePredictionData();
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
		const qs = getQuestionsForUmbrella(umbrellaFromContext._id);
		if (!qs || qs.length === 0) {
			if (!contextLoading) {
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
			return;
		}
		const sanitized = (qs as any[]).filter(
			(q) =>
				q &&
				((q as any)._id || (q as any).questionId || (q as any).marketId)
		);
		if (!hasLogged.current.markets) {
			hasLogged.current.markets = true;
		}
		setQuestions(sanitized as any);
		setLoading(false);
	}, [
		umbrellaId,
		umbrellas,
		contextLoading,
		// Removed function dependencies that cause infinite re-renders
		// getUmbrellaById, getQuestionsForUmbrella, getOrderbookForQuestion are stable
		navigate,
	]);

	useEffect(() => {
		if (!umbrella || !isTradingDebugLoggingEnabled()) return;
		try {
			const clone = JSON.parse(JSON.stringify(umbrella)) as Umbrella;
			console.log("[PredictionMarket] full umbrella object:", clone);
			console.log(
				"[PredictionMarket] umbrella.exchangeMatching.limitless (DB-shaped; not what Basic tab uses):",
				clone.exchangeMatching?.limitless ?? "(absent — Limitless tab still works if GET /matched-markets + WS include it)",
			);
		} catch {
			console.log("[PredictionMarket] full umbrella object (non-serializable fields omitted):", umbrella);
			console.log(
				"[PredictionMarket] umbrella.exchangeMatching.limitless:",
				umbrella.exchangeMatching?.limitless ?? "(absent)",
			);
		}
	}, [umbrella]);

	const {
		questionOrderbooks,
		orderbooksReady,
		fetchAllOrderbooks,
	} = useUmbrellaLiveOrderbooks(
		umbrella?._id,
		questions,
		getOrderbookForQuestion,
		refreshOrderbook,
	);

	// Poll for THIS umbrella's updates every 60 seconds (e.g., streamEnabled toggled by cron)
	useEffect(() => {
		if (!umbrella?._id) return;

		const interval = setInterval(async () => {
			try {
				// Fetch only this specific umbrella using umbrellaDataService
				const updatedUmbrella =
					await umbrellaDataService.fetchUmbrellaById(umbrella._id);
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
			const computedLineHeight =
				parseFloat(getComputedStyle(el).lineHeight) || maxFont * 1.2;
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

	// Function to switch active market and position when Trade Yes/No is clicked
	const handleMarketSwitch = useCallback(
		(market: PredictionMarket, position: "yes" | "no") => {
			setActiveMarket(market);
			setActivePosition(position);
			setHasUserSelectedMarket(true);
		},
		[]
	);

	// Function to update just the position (for trading box callbacks)
	const handlePositionChange = useCallback((position: "yes" | "no") => {
		setActivePosition(position);
	}, []);

	// Function to handle market switch with orderbook opening (for Yes/No button clicks)
	const handleMarketSwitchWithOrderbook = useCallback(
		(market: PredictionMarket, position: "yes" | "no") => {
			// Switch active market and position
			setActiveMarket(market);
			setActivePosition(position);
			setHasUserSelectedMarket(true); // Mark as user-selected to prevent auto-reset
		},
		[]
	);

	// Get the active market's orderbook
	const activeMarketOrderbook = useMemo(() => {
		if (!activeMarket) return null;
		const orderBookId =
			activeMarket._id ||
			activeMarket.questionId ||
			activeMarket.marketId;
		const orderbook = questionOrderbooks[orderBookId] || null;
		return orderbook;
	}, [activeMarket, questionOrderbooks]);

	// Update the live ask store with the active market's best ask price
	useEffect(() => {
		if (
			activeMarketOrderbook?.asks &&
			activeMarketOrderbook.asks.length > 0
		) {
			// Removed unused bestAsk calculation
			// NOTE: Live ask store is now managed separately for chart independence
			// The chart has its own live ask management that doesn't depend on activeMarket
		}
	}, [activeMarketOrderbook, activeMarket]);

	const sortedQuestions = useVolumeSortedQuestions(
		questions,
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
		if (
			!hasUserSelectedMarket &&
			!hasProcessedStoredSelection &&
			sortedQuestions.length > 0
		) {
			setHasProcessedStoredSelection(true);

			// Check for stored market ID from navigation
			const storedMarketId = localStorage.getItem("selectedMarketId");
			let targetMarket: PredictionMarket | null = null;

			if (storedMarketId) {
				// Find the market with the stored ID
				targetMarket =
					sortedQuestions.find((question) => {
						const marketId =
							question._id ||
							question.questionId ||
							question.marketId;
						return marketId === storedMarketId;
					}) || null;

				// Clear the stored market ID after using it
				localStorage.removeItem("selectedMarketId");
			}

			// If no stored market found, use the top market
			if (!targetMarket) {
				targetMarket = sortedQuestions[0];
			}

			// Set the target market as active
			if (
				targetMarket &&
				(!activeMarket ||
					getMarketId(activeMarket) !== getMarketId(targetMarket))
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

	// Hooks must be called unconditionally on every render
	const chartOnlyState = useChartState(
		sortedQuestions as any[],
		questionOrderbooks
	);

	const pandascoreMatchIdRaw =
		typeof umbrella?.pandascore_matchId === "string"
			? umbrella.pandascore_matchId.trim()
			: "";
	const settledInfo = useMatchSettled(
		umbrella?._id,
		pandascoreMatchIdRaw || undefined,
		umbrella
			? {
					pandascore_matchId: umbrella.pandascore_matchId,
					displayName: umbrella.displayName,
					teamMappings: umbrella.teamMappings,
				}
			: null
	);

	// Only show error page if umbrella fails to load
	if (loading && !umbrella) {
		return (
			<div className="default-container page-layout">
				<div className="mb-2">
					<h1 className="mb-16 text-34 font-bold">
						<Trans>Umbrella Not Found</Trans>
					</h1>
					<p className="error-message">
						Please navigate to this page from the Predictions list.
					</p>
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

	// Show error page if umbrella is explicitly null after loading
	if (!loading && !umbrella) {
		return (
			<div className="default-container page-layout">
				<div className="mb-2">
					<h1 className="mb-16 text-34 font-bold">
						<Trans>Umbrella Not Found</Trans>
					</h1>
					<p className="error-message">
						Please navigate to this page from the Predictions list.
					</p>
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

	return (
		<PredictionCurtainProvider>
			<div
				className={`prediction-market-page ${
					isMobile ? "mobile" : "desktop"
				}`}
			>
				{umbrella && (
					<MarketHeader umbrella={umbrella} titleRef={titleRef} />
				)}

			<MarketPanels
				umbrella={umbrella!}
				sortedQuestions={sortedQuestions as any}
				questionOrderbooks={questionOrderbooks}
				activeMarket={activeMarket as any}
				activePosition={activePosition}
				onMarketSwitch={handleMarketSwitch}
				onMarketSwitchWithOrderbook={
					handleMarketSwitchWithOrderbook
				}
				onPositionChange={handlePositionChange}
				fetchAllOrderbooks={fetchAllOrderbooks}
				chartState={chartOnlyState}
				settledInfo={settledInfo}
			/>
		</div>
		</PredictionCurtainProvider>
	);
}
