import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Trans } from "@lingui/macro";
import { useNavigate, useParams } from "react-router-dom";
import { useMedia } from "react-use";
import Footer from "components/Footer/Footer";
import Button from "components/Button/Button";
// Removed PredictionMarketTradeBox - not used in this component
// Chart is rendered via MarketPanels
import type { PredictionMarket } from "lib/predictionMarketDataService";
// Removed predictionMarketDataService - not used in this component
import { Umbrella } from "lib/umbrellaDataService";
import { getPredictionWebSocketUrl } from "lib/predictionApiBase";
// OrderbookService usage moved into hooks
import { usePredictionData } from "context/PredictionDataContext";
// Removed usePredictionMarket - not used in this component
import { MarketPanels } from "./PredictionMarket/MarketPanels";
import { useChartState } from "./PredictionMarket/useChartState";
import { MarketHeader } from "./PredictionMarket/MarketHeader";
// Removed local Orderbook context in favor of global PredictionDataContext
import "./PredictionMarket.scss";
import { PredictionCurtainProvider } from "components/PredictionMarketTradeBox/PredictionCurtain";
// Removed runBatchTestOrders - not used in this component
// Removed gtaVIImage - not used in this component
// Removed RulesSection - not used in this component

// Helper function to calculate best ask from orderbook
const getBestAsk = (orderbook: any) => {
	if (!orderbook?.asks || orderbook.asks.length === 0) return null;
	return Math.min(...orderbook.asks.map((a: any) => a.price));
};

export default function PredictionMarket() {
	return <PredictionMarketContent />;
}

function PredictionMarketContent() {
	const { umbrellaId } = useParams<{ umbrellaId: string }>();
	const navigate = useNavigate();
	const [umbrella, setUmbrella] = useState<Umbrella | null>(null);
	const [questions, setQuestions] = useState<PredictionMarket[]>([]);
	const [questionOrderbooks, setQuestionOrderbooks] = useState<{
		[questionId: string]: any;
	}>({});
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
	const [openOrderbookId, setOpenOrderbookId] = useState<string | null>(null);
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
		getOrderbookForQuestion,
		refreshOrderbook,
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
		if (!hasLogged.current.umbrella) {
			try {
				console.groupCollapsed("🧩 Umbrella (PredictionMarket page)");
				console.log(umbrellaFromContext);
				console.groupEnd();
			} catch {}
			hasLogged.current.umbrella = true;
		}
		const qs = getQuestionsForUmbrella(umbrellaFromContext._id);
		if (!qs || qs.length === 0) {
			setQuestions([]);
			setLoading(false);
			navigate("/predictions", { replace: true });
			return;
		}
		const sanitized = (qs as any[]).filter(
			(q) =>
				q &&
				((q as any)._id || (q as any).questionId || (q as any).marketId)
		);
		if (!hasLogged.current.markets) {
			try {
				console.groupCollapsed("🧺 Markets (PredictionMarket page)");
				console.log("raw questions from context:", qs);
				console.log("sanitized markets:", sanitized);
				console.groupEnd();
			} catch {}
			hasLogged.current.markets = true;
		}
		setQuestions(sanitized as any);

		// Seed local orderbook map from context
		const seeded: { [qid: string]: any } = {};
		for (const q of (qs as any[]).filter(Boolean)) {
			const qid =
				(q as any)?._id ||
				(q as any)?.questionId ||
				(q as any)?.marketId;
			if (qid)
				seeded[qid] = getOrderbookForQuestion(
					umbrellaFromContext._id,
					qid
				);
		}
		setQuestionOrderbooks(seeded);
		setLoading(false);
	}, [
		umbrellaId,
		umbrellas,
		// Removed function dependencies that cause infinite re-renders
		// getUmbrellaById, getQuestionsForUmbrella, getOrderbookForQuestion are stable
		navigate,
	]);

	// WebSocket connections for real-time orderbook updates
	useEffect(() => {
		if (!umbrella?._id || questions.length === 0) return;

		const wsUrl = getPredictionWebSocketUrl();
		const connections: WebSocket[] = [];

		console.log(
			`🔌 Connecting WebSockets for ${questions.length} markets...`
		);

		// Create a WebSocket connection for each market
		questions.forEach((question) => {
			const marketId =
				question._id || question.questionId || question.marketId;
			if (!marketId) return;

			try {
				const ws = new WebSocket(`${wsUrl}/orderbook/${marketId}`);

				ws.onopen = () => {
					console.log(
						`✅ WebSocket connected for market ${marketId}`
					);
				};

				ws.onmessage = (event) => {
					try {
						console.log(
							`📦 WebSocket message received for market ${marketId}:`,
							event.data
						);
						const message = JSON.parse(event.data);

						// Extract the orderbook snapshot from the message
						const orderbook = message.snapshot || message;
						console.log(
							`📊 Parsed orderbook for market ${marketId}:`,
							orderbook
						);

						// Update the orderbook for this specific market
						setQuestionOrderbooks((prev) => ({
							...prev,
							[marketId]: orderbook,
						}));
					} catch (error) {
						console.error(
							"error",
							`Failed to parse WebSocket message for market ${marketId}:`,
							error
						);
					}
				};

				ws.onerror = (error) => {
					console.error(
						"error",
						`WebSocket error for market ${marketId}:`,
						error
					);
				};

				ws.onclose = () => {
					console.log(`🔌 WebSocket closed for market ${marketId}`);
				};

				connections.push(ws);
			} catch (error) {
				console.error(
					"error",
					`Failed to create WebSocket for market ${marketId}:`,
					error
				);
			}
		});

		// Cleanup: close all connections on unmount or when dependencies change
		return () => {
			console.log(
				`🔌 Closing ${connections.length} WebSocket connections...`
			);
			connections.forEach((ws) => {
				if (
					ws.readyState === WebSocket.OPEN ||
					ws.readyState === WebSocket.CONNECTING
				) {
					ws.close();
				}
			});
		};
	}, [umbrella?._id, questions.length]);

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

	// Refresh orderbooks for all questions via context
	const fetchAllOrderbooks = useCallback(
		async (qs: PredictionMarket[]) => {
			if (!umbrella) return;
			await Promise.all(
				(qs || []).map(async (q) => {
					const qid =
						(q as any)._id ||
						(q as any).questionId ||
						(q as any).marketId;
					if (!qid) return;
					await refreshOrderbook(umbrella._id, qid);
				})
			);
			// Re-seed from context after refresh
			const updated: { [qid: string]: any } = {};
			for (const q of qs as any[]) {
				const qid =
					(q as any)._id ||
					(q as any).questionId ||
					(q as any).marketId;
				if (qid)
					updated[qid] = getOrderbookForQuestion(umbrella._id, qid);
			}
			setQuestionOrderbooks(updated);
		},
		[umbrella, refreshOrderbook, getOrderbookForQuestion]
	);

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

	// Function to handle orderbook toggle (for header clicks)
	const handleOrderbookToggle = useCallback((marketId: string) => {
		setOpenOrderbookId((prev) => (prev === marketId ? null : marketId));
	}, []);

	// Function to handle market switch with orderbook opening (for Yes/No button clicks)
	const handleMarketSwitchWithOrderbook = useCallback(
		(market: PredictionMarket, position: "yes" | "no") => {
			const marketId = market._id || market.questionId || market.marketId;

			// Switch active market and position
			setActiveMarket(market);
			setActivePosition(position);
			setHasUserSelectedMarket(true); // Mark as user-selected to prevent auto-reset

			// Open this orderbook (closes others automatically)
			setOpenOrderbookId(marketId);
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

	// Sort questions by highest Yes price (bestAsk)
	const sortedQuestions = useMemo(() => {
		return [...questions].sort((a, b) => {
			const orderBookIdA = a._id || a.questionId || a.marketId;
			const orderBookIdB = b._id || b.questionId || b.marketId;

			const orderbookA = questionOrderbooks[orderBookIdA];
			const orderbookB = questionOrderbooks[orderBookIdB];

			// Calculate Yes prices (bestAsk) for both markets
			const bestAskA = getBestAsk(orderbookA);
			const bestAskB = getBestAsk(orderbookB);

			// Sort by highest Yes price first (descending order)
			// Handle null/undefined cases by putting them at the end
			if (bestAskA === null && bestAskB === null) return 0;
			if (bestAskA === null) return 1;
			if (bestAskB === null) return -1;

			return bestAskB - bestAskA;
		});
	}, [questions, questionOrderbooks]);

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

	// Auto-refresh active market orderbook every 15 seconds via context
	// DISABLED: Now using WebSocket for real-time updates instead of HTTP polling
	// useEffect(() => {
	// 	if (!activeMarket || !umbrella) return;
	// 	const activeMarketId = getMarketId(activeMarket);
	// 	if (!activeMarketId) return;

	// 	const refreshActive = async () => {
	// 		await refreshOrderbook(umbrella._id, activeMarketId);
	// 		const ob = getOrderbookForQuestion(umbrella._id, activeMarketId);
	// 		setQuestionOrderbooks((prev) => ({
	// 			...prev,
	// 			[activeMarketId]: ob,
	// 		}));
	// 	};

	// 	// Initial and interval refresh
	// 	refreshActive();
	// 	const interval = setInterval(refreshActive, 20000); // 20 seconds
	// 	return () => clearInterval(interval);
	// }, [
	// 	activeMarket,
	// 	umbrella,
	// 	// Removed function dependencies that cause infinite re-renders
	// 	// getMarketId, refreshOrderbook, getOrderbookForQuestion are stable
	// ]);

	// Cleanup localStorage when component unmounts
	useEffect(() => {
		return () => {
			// Clear the activePosition from localStorage when leaving the page
			// Note: Don't clear selectedMarketId here as it might be needed for the next page load
			localStorage.removeItem("activePosition");
		};
	}, []);
	// Removed local fetchOrderbook tied to OrderbookContext; using global context refresh instead

	// Hooks must be called unconditionally on every render
	const chartOnlyState = useChartState(
		sortedQuestions as any[],
		questionOrderbooks
	);

	if (loading) {
		return (
			<div className="default-container page-layout">
				<div className="mb-2">
					<h1 className="mb-16 text-34 font-bold">
						<Trans>Loading Market...</Trans>
					</h1>
				</div>
				<Footer />
			</div>
		);
	}

	if (!umbrella) {
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
						onClick={() => navigate("/predictions")}
						style={{
							padding: "12px 24px",
							fontSize: "16px",
							marginTop: "16px",
						}}
					>
						← Back to Predictions
					</Button>
				</div>
				<Footer />
			</div>
		);
	}

	// Removed unused goBack function

	return (
		<PredictionCurtainProvider>
			<div
				className={`prediction-market-page ${
					isMobile ? "mobile" : "desktop"
				}`}
			>
				<MarketHeader umbrella={umbrella} titleRef={titleRef} />

				<MarketPanels
					umbrella={umbrella}
					sortedQuestions={sortedQuestions as any}
					questionOrderbooks={questionOrderbooks}
					activeMarket={activeMarket as any}
					activePosition={activePosition}
					openOrderbookId={openOrderbookId}
					onMarketSwitch={handleMarketSwitch}
					onMarketSwitchWithOrderbook={
						handleMarketSwitchWithOrderbook
					}
					onOrderbookToggle={handleOrderbookToggle}
					onPositionChange={handlePositionChange}
					fetchAllOrderbooks={fetchAllOrderbooks}
					chartState={chartOnlyState}
				/>

				<div style={{ marginTop: "auto" }}>
					<Footer />
				</div>
			</div>
		</PredictionCurtainProvider>
	);
}
