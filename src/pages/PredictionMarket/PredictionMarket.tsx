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
import { getPredictionWebSocketUrl } from "@/config/predictionApiBase";
import { usePredictionData } from "context/PredictionDataContext";
import { MarketPanels } from "./MarketPanels";
import { useChartState } from "./useChartState";
import { MarketHeader } from "./MarketHeader";
import "./PredictionMarket.scss";
import { PredictionCurtainProvider } from "./PredictionMarketTradeBox/PredictionCurtain";

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
	const [orderbooksReady, setOrderbooksReady] = useState(false);
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
		allBooksPreview,
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
			// Don't redirect if context is still loading - data might not be fetched yet
			if (!contextLoading) {
				setQuestions([]);
				setLoading(false);
				navigate("/predictions", { replace: true });
				return;
			}
			// Context is still loading, wait for data
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
		contextLoading,
		// Removed function dependencies that cause infinite re-renders
		// getUmbrellaById, getQuestionsForUmbrella, getOrderbookForQuestion are stable
		navigate,
	]);

	// WebSocket connections for real-time orderbook updates
	useEffect(() => {
		if (!umbrella?._id || questions.length === 0) return;

		const wsUrl = getPredictionWebSocketUrl();
		const connections: WebSocket[] = [];
		const receivedOrderbooks = new Set<string>();

		// Reset ready state when questions change
		setOrderbooksReady(false);

		// Get all market IDs we're expecting
		const expectedMarketIds = questions
			.map((q) => q._id || q.questionId || q.marketId)
			.filter(Boolean);

		// Create a WebSocket connection for each market
		questions.forEach((question) => {
			const marketId =
				question._id || question.questionId || question.marketId;
			if (!marketId) return;

			try {
				const ws = new WebSocket(`${wsUrl}/orderbook/${marketId}`);

				ws.onopen = () => {
					// WebSocket connected
				};

				ws.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data);

						// Extract the orderbook snapshot from the message
						const orderbook = message.snapshot || message;

						// Update the orderbook for this specific market
						setQuestionOrderbooks((prev) => ({
							...prev,
							[marketId]: orderbook,
						}));

						// Track that we've received data for this market
						receivedOrderbooks.add(marketId);

						// Check if all orderbooks have been received
						if (
							receivedOrderbooks.size === expectedMarketIds.length
						) {
							setOrderbooksReady(true);
						}
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
					// WebSocket closed
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

		// Fallback timeout - if orderbooks don't load within 5 seconds, show UI anyway
		const timeout = setTimeout(() => {
			if (!receivedOrderbooks.size) {
				setOrderbooksReady(true);
			}
		}, 5000);

		// Cleanup: close all connections on unmount or when dependencies change
		return () => {
			clearTimeout(timeout);
			localStorage.removeItem("activePosition");

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

	// Helper to get lowestAsk from WebSocket orderbook data
	const getLowestAsk = useCallback(
		(questionId: string) => {
			const orderbook = questionOrderbooks[questionId];
			if (!orderbook?.asks || orderbook.asks.length === 0) return null;
			return Math.min(...orderbook.asks.map((a: any) => a.price));
		},
		[questionOrderbooks]
	);

	// Sort questions by highest Yes price using live WebSocket orderbook data
	// Sort once when orderbooks are ready, then keep stable
	const sortedQuestions = useMemo(() => {
		const sorted = [...questions].sort((a, b) => {
			const questionIdA = a._id || a.questionId || a.marketId;
			const questionIdB = b._id || b.questionId || b.marketId;

			// Use live WebSocket orderbook data for accurate current prices
			const yesPriceA = getLowestAsk(questionIdA);
			const yesPriceB = getLowestAsk(questionIdB);

			// Sort by highest Yes price first (descending order)
			// Handle null/undefined cases by putting them at the end
			if (yesPriceA === null && yesPriceB === null) return 0;
			if (yesPriceA === null) return 1;
			if (yesPriceB === null) return -1;

			return yesPriceB - yesPriceA;
		});

		return sorted;
	}, [questions, orderbooksReady, getLowestAsk]); // Re-sort when orderbooks become ready

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

			// Auto-open orderbook for single-market umbrellas
			if (sortedQuestions.length === 1 && targetMarket) {
				const marketId = getMarketId(targetMarket);
				if (marketId) {
					setOpenOrderbookId(marketId);
				}
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
				openOrderbookId={openOrderbookId}
				onMarketSwitch={handleMarketSwitch}
				onMarketSwitchWithOrderbook={
					handleMarketSwitchWithOrderbook
				}
				onOrderbookToggle={handleOrderbookToggle}
				onPositionChange={handlePositionChange}
				fetchAllOrderbooks={fetchAllOrderbooks}
				chartState={chartOnlyState}
				orderbooksReady={orderbooksReady}
			/>
		</div>
		</PredictionCurtainProvider>
	);
}
