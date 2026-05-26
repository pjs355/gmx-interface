import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMedia } from "react-use";
import { usePredictionData } from "context/PredictionDataContext";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { PredictionCurtainProvider } from "@/components/PredictionMarketTradeBox";
import { useUmbrellaLiveOrderbooks } from "@/pages/PredictionMarket/useUmbrellaLiveOrderbooks";
import { useUmbrellaTradePricing } from "@/pages/PredictionMarket/useUmbrellaTradePricing";
import { useVolumeSortedQuestions } from "@/pages/PredictionMarket/useVolumeSortedQuestions";
import { useMatchSettled } from "@/pages/PredictionMarket/useMatchSettled";
import { UmbrellaTradeBoxPanel } from "@/pages/PredictionMarket/UmbrellaTradeBoxPanel";

export type HomeOddsSelectPayload = {
	umbrella: Umbrella;
	question: PredictionMarket;
	position: "yes" | "no";
};

type HomeTradeDockContextValue = {
	onHomeOddsSelect: (payload: HomeOddsSelectPayload) => void;
	isHomeTradeMobile: boolean;
} | null;

export const HomeTradeDockContext = React.createContext<HomeTradeDockContextValue>(null);

export function useHomeTradeDockOptional() {
	return React.useContext(HomeTradeDockContext);
}

/**
 * localStorage keys used to remember which umbrella + market the home dock
 * was focused on, so navigating *back* to the home page from a market detail
 * page keeps the same trade widget instead of resetting to the top of the
 * filtered list. Cleared when the user changes filters (a deliberate "show
 * me something else" intent), and ignored when the pinned umbrella is no
 * longer in the visible set.
 */
const HOME_DOCK_PINNED_UMBRELLA_KEY = "homeDockPinnedUmbrellaId";
const HOME_DOCK_ACTIVE_MARKET_KEY = "homeDockActiveMarketId";

function readStoredId(key: string): string | null {
	try {
		const raw = localStorage.getItem(key);
		return typeof raw === "string" && raw.length > 0 ? raw : null;
	} catch {
		return null;
	}
}

function writeStoredId(key: string, value: string | null): void {
	try {
		if (value) {
			localStorage.setItem(key, value);
		} else {
			localStorage.removeItem(key);
		}
	} catch {
		/* localStorage unavailable — silently no-op */
	}
}

type HomeInlineTradeLayoutProps = {
	children: React.ReactNode;
	/** When false, children render unchanged (no dock, no extra subscriptions). */
	enabled: boolean;
	visibleUmbrellas: Umbrella[];
	/** Reset dock focus when game filter pill changes. */
	selectedGame: string | null;
};

export function HomeInlineTradeLayout({
	children,
	enabled,
	visibleUmbrellas,
	selectedGame,
}: HomeInlineTradeLayoutProps) {
	const isDesktop = useMedia("(min-width: 1101px)");
	const isMobile = useMedia("(max-width: 1100px)");

	const { getQuestionsForUmbrella, getOrderbookForQuestion, refreshOrderbook } =
		usePredictionData();

	/*
	 * Lazy-init the focused umbrella from localStorage. When the user comes
	 * back to the home page from an umbrella detail page, we want the dock
	 * to keep the umbrella they were just looking at instead of snapping
	 * back to the top of the filtered list. The "still visible" guard
	 * effect below drops the pin if the stored umbrella isn't in the current
	 * filter result.
	 */
	const [pinnedUmbrellaId, setPinnedUmbrellaId] = useState<string | null>(() =>
		readStoredId(HOME_DOCK_PINNED_UMBRELLA_KEY),
	);
	const [hasUserSelected, setHasUserSelected] = useState<boolean>(
		() => readStoredId(HOME_DOCK_PINNED_UMBRELLA_KEY) !== null,
	);
	const [activeMarket, setActiveMarket] = useState<PredictionMarket | null>(() => {
		// We only have an ID at mount time; resolve to a full PredictionMarket
		// once we know which umbrella + question list applies (effect below).
		return null;
	});
	const [activePosition, setActivePosition] = useState<"yes" | "no">(() => {
		const stored = localStorage.getItem("activePosition");
		return stored === "yes" || stored === "no" ? stored : "yes";
	});

	const firstVisible = visibleUmbrellas[0] ?? null;

	/**
	 * Reset the dock when the user changes filters/search. Distinguishes
	 * "user changed filter" (intentional reset) from "data refreshed and the
	 * top umbrella swapped" (don't reset — keep what the user pinned).
	 *
	 * Tracked via a ref so we only run on `selectedGame` changes after mount;
	 * the very first run (on mount) is a no-op so it doesn't immediately wipe
	 * the lazy-init pin.
	 */
	const previousSelectedGameRef = useRef(selectedGame);
	useEffect(() => {
		if (previousSelectedGameRef.current === selectedGame) return;
		previousSelectedGameRef.current = selectedGame;
		setPinnedUmbrellaId(null);
		setHasUserSelected(false);
		writeStoredId(HOME_DOCK_PINNED_UMBRELLA_KEY, null);
		writeStoredId(HOME_DOCK_ACTIVE_MARKET_KEY, null);
	}, [selectedGame]);

	/** Drop the pin if the stored umbrella is no longer in the visible set
	 *  (e.g., it was filtered out by a tag toggle). */
	useEffect(() => {
		if (!pinnedUmbrellaId) return;
		if (visibleUmbrellas.length === 0) return; // still loading
		const stillVisible = visibleUmbrellas.some((u) => u._id === pinnedUmbrellaId);
		if (!stillVisible) {
			setPinnedUmbrellaId(null);
			setHasUserSelected(false);
			writeStoredId(HOME_DOCK_PINNED_UMBRELLA_KEY, null);
			writeStoredId(HOME_DOCK_ACTIVE_MARKET_KEY, null);
		}
	}, [pinnedUmbrellaId, visibleUmbrellas]);

	const focusedUmbrella = useMemo(() => {
		if (!enabled || visibleUmbrellas.length === 0) return null;
		if (pinnedUmbrellaId) {
			const hit = visibleUmbrellas.find((u) => u._id === pinnedUmbrellaId);
			if (hit) return hit;
		}
		return firstVisible;
	}, [enabled, visibleUmbrellas, pinnedUmbrellaId, firstVisible]);

	const focusedUmbrellaIdRef = useRef<string | null>(null);
	useEffect(() => {
		focusedUmbrellaIdRef.current = focusedUmbrella?._id ?? null;
	}, [focusedUmbrella?._id]);

	/** After closing the mobile sheet, selecting odds on a *different* umbrella resets dock hydration from storage. */
	const lastClosedUmbrellaIdRef = useRef<string | null>(null);

	const handleCurtainClosed = useCallback(() => {
		if (!enabled || !isMobile) return;
		lastClosedUmbrellaIdRef.current = focusedUmbrellaIdRef.current;
	}, [enabled, isMobile]);

	const questions = useMemo(() => {
		if (!focusedUmbrella?._id) return [] as PredictionMarket[];
		const qs = getQuestionsForUmbrella(focusedUmbrella._id);
		if (!qs?.length) return [];
		return (qs as PredictionMarket[]).filter(
			(q) =>
				q &&
				((q as { _id?: string })._id ||
					(q as { questionId?: string }).questionId ||
					(q as { marketId?: string }).marketId),
		);
	}, [focusedUmbrella?._id, getQuestionsForUmbrella]);

	const umbrellaIdForHook = enabled ? focusedUmbrella?._id : undefined;
	const questionsForHook = enabled ? questions : [];

	const { questionOrderbooks, orderbooksReady } = useUmbrellaLiveOrderbooks(
		umbrellaIdForHook,
		questionsForHook,
		getOrderbookForQuestion,
		refreshOrderbook,
	);

	const sortedQuestions = useVolumeSortedQuestions(
		questionsForHook,
		questionOrderbooks,
		orderbooksReady,
	);

	/** Same idea as `MarketPanels`: never leave the dock trade column on skeleton while we have questions. */
	const tradeBoxActiveMarket = activeMarket ?? sortedQuestions[0] ?? null;

	const { tradingPagePrices } = useUmbrellaTradePricing({
		umbrella: enabled ? focusedUmbrella : null,
	});

	const pandascoreMatchIdRaw =
		typeof focusedUmbrella?.pandascore_matchId === "string"
			? focusedUmbrella.pandascore_matchId.trim()
			: "";
	const settledInfo = useMatchSettled(
		enabled ? focusedUmbrella?._id : undefined,
		pandascoreMatchIdRaw || undefined,
		focusedUmbrella && enabled
			? {
					pandascore_matchId: focusedUmbrella.pandascore_matchId,
					displayName: focusedUmbrella.displayName,
					teamMappings: focusedUmbrella.teamMappings,
				}
			: null,
	);

	/**
	 * Pick the active market.
	 *
	 * 1. If we just came back from an umbrella detail page, the umbrella we
	 *    pinned + the market id we stored survive in localStorage. As soon
	 *    as `sortedQuestions` is populated for the focused umbrella, hydrate
	 *    `activeMarket` to that stored question (when it still exists) so
	 *    the trade widget keeps the *exact* market the user just left.
	 * 2. Otherwise (no stored market, or user hasn't interacted yet), fall
	 *    back to the volume-sorted top question for the focused umbrella.
	 */
	useEffect(() => {
		if (!enabled) return;
		if (sortedQuestions.length === 0) {
			if (activeMarket !== null) setActiveMarket(null);
			return;
		}

		// Match-by-id helper (PredictionMarket has any of `_id`/`questionId`/`marketId`).
		const idOf = (q: PredictionMarket): string =>
			(q as any)._id || (q as any).questionId || (q as any).marketId || "";

		// Prefer a stored selection for the *current* focused umbrella; the
		// stored id was written either by `handleHomeOddsSelect` or by the
		// umbrella page on its way back here.
		const storedActiveId = readStoredId(HOME_DOCK_ACTIVE_MARKET_KEY);
		if (storedActiveId) {
			const hit = sortedQuestions.find((q) => idOf(q) === storedActiveId);
			if (hit) {
				if (!activeMarket || idOf(activeMarket) !== idOf(hit)) {
					setActiveMarket(hit);
				}
				return;
			}
			// Stored id no longer matches any question for this umbrella —
			// drop it and fall through to the volume-sorted default below.
			writeStoredId(HOME_DOCK_ACTIVE_MARKET_KEY, null);
		}

		// User hasn't pinned a market on this umbrella yet — show the top one.
		if (!hasUserSelected) {
			const top = sortedQuestions[0];
			if (!activeMarket || idOf(activeMarket) !== idOf(top)) {
				setActiveMarket(top);
			}
			return;
		}

		// Pinned umbrella in the dock but no stored market id, or current market left the list
		// (e.g. storage cleared, bad id). Without this branch `activeMarket` stays null forever
		// while `hasUserSelected` is true → permanent `TradeBoxSkeleton`.
		const curId = activeMarket ? idOf(activeMarket) : "";
		const inList = Boolean(curId) && sortedQuestions.some((q) => idOf(q) === curId);
		if (!activeMarket || !inList) {
			setActiveMarket(sortedQuestions[0]);
		}
	}, [enabled, hasUserSelected, sortedQuestions, activeMarket]);

	/** Persist the focused umbrella id whenever it changes (or clears). */
	useEffect(() => {
		writeStoredId(HOME_DOCK_PINNED_UMBRELLA_KEY, pinnedUmbrellaId);
	}, [pinnedUmbrellaId]);

	/** Persist the active market id whenever it changes (or clears). */
	useEffect(() => {
		const id = activeMarket
			? (activeMarket as any)._id ||
				(activeMarket as any).questionId ||
				(activeMarket as any).marketId ||
				null
			: null;
		writeStoredId(HOME_DOCK_ACTIVE_MARKET_KEY, id);
	}, [activeMarket]);

	const handleHomeOddsSelect = useCallback(
		(payload: HomeOddsSelectPayload) => {
			const closedFrom = lastClosedUmbrellaIdRef.current;
			if (isMobile && closedFrom !== null && payload.umbrella._id !== closedFrom) {
				writeStoredId(HOME_DOCK_ACTIVE_MARKET_KEY, null);
				setHasUserSelected(false);
			}
			lastClosedUmbrellaIdRef.current = null;

			setPinnedUmbrellaId(payload.umbrella._id);
			setHasUserSelected(true);
			setActiveMarket(payload.question);
			setActivePosition(payload.position);
			localStorage.setItem("activePosition", payload.position);
		},
		[isMobile],
	);

	const handlePositionChange = useCallback((p: "yes" | "no") => {
		setActivePosition(p);
		localStorage.setItem("activePosition", p);
	}, []);

	const contextValue = useMemo(
		() =>
			enabled
				? {
						onHomeOddsSelect: handleHomeOddsSelect,
						isHomeTradeMobile: isMobile,
					}
				: null,
		[enabled, handleHomeOddsSelect, isMobile],
	);

	if (!enabled) {
		return <>{children}</>;
	}

	return (
		<HomeTradeDockContext.Provider value={contextValue}>
			<PredictionCurtainProvider onCurtainClosed={handleCurtainClosed}>
				<div className="predictions-page__home-trade-grid">
					<div className="predictions-page__home-trade-main">{children}</div>
					{isDesktop && focusedUmbrella && (
						<div className="right-panel predictions-page__home-trade-panel">
							<UmbrellaTradeBoxPanel
								umbrella={focusedUmbrella}
								questionOrderbooks={questionOrderbooks}
								activeMarket={tradeBoxActiveMarket}
								activePosition={activePosition}
								onPositionChange={handlePositionChange}
								settledInfo={settledInfo}
								tradingPagePrices={tradingPagePrices}
								mobilePeekBar="default"
							/>
						</div>
					)}
				</div>
				{isMobile && focusedUmbrella && (
					<div className="predictions-page__home-trade-mobile predictions-page__home-trade-mobile--peek-hidden">
						<UmbrellaTradeBoxPanel
							umbrella={focusedUmbrella}
							questionOrderbooks={questionOrderbooks}
							activeMarket={tradeBoxActiveMarket}
							activePosition={activePosition}
							onPositionChange={handlePositionChange}
							settledInfo={settledInfo}
							tradingPagePrices={tradingPagePrices}
							mobilePeekBar="hidden"
						/>
					</div>
				)}
			</PredictionCurtainProvider>
		</HomeTradeDockContext.Provider>
	);
}
