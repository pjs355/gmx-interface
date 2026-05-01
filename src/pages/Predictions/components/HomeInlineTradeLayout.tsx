import React, {
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useMedia } from "react-use";
import { usePredictionData } from "context/PredictionDataContext";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { PredictionCurtainProvider } from "@/pages/PredictionMarket/PredictionMarketTradeBox/PredictionCurtain";
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

export const HomeTradeDockContext =
	React.createContext<HomeTradeDockContextValue>(null);

export function useHomeTradeDockOptional() {
	return React.useContext(HomeTradeDockContext);
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

	const {
		getQuestionsForUmbrella,
		getOrderbookForQuestion,
		refreshOrderbook,
	} = usePredictionData();

	const [pinnedUmbrellaId, setPinnedUmbrellaId] = useState<string | null>(null);
	const [hasUserSelected, setHasUserSelected] = useState(false);
	const [activeMarket, setActiveMarket] = useState<PredictionMarket | null>(
		null,
	);
	const [activePosition, setActivePosition] = useState<"yes" | "no">(() => {
		const stored = localStorage.getItem("activePosition");
		return stored === "yes" || stored === "no" ? stored : "yes";
	});

	const firstVisible = visibleUmbrellas[0] ?? null;
	const firstVisibleId = firstVisible?._id ?? null;

	useEffect(() => {
		setPinnedUmbrellaId(null);
		setHasUserSelected(false);
	}, [firstVisibleId, selectedGame]);

	const focusedUmbrella = useMemo(() => {
		if (!enabled || visibleUmbrellas.length === 0) return null;
		if (pinnedUmbrellaId) {
			const hit = visibleUmbrellas.find((u) => u._id === pinnedUmbrellaId);
			if (hit) return hit;
		}
		return firstVisible;
	}, [enabled, visibleUmbrellas, pinnedUmbrellaId, firstVisible]);

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

	const { tradingPagePrices } = useUmbrellaTradePricing({
		umbrella: enabled ? focusedUmbrella : null,
		sortedQuestions,
		questionOrderbooks,
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

	useEffect(() => {
		if (!enabled || hasUserSelected) return;
		if (sortedQuestions.length === 0) {
			setActiveMarket(null);
			return;
		}
		setActiveMarket(sortedQuestions[0]);
	}, [enabled, hasUserSelected, sortedQuestions]);

	const handleHomeOddsSelect = useCallback(
		(payload: HomeOddsSelectPayload) => {
			setPinnedUmbrellaId(payload.umbrella._id);
			setHasUserSelected(true);
			setActiveMarket(payload.question);
			setActivePosition(payload.position);
			localStorage.setItem("activePosition", payload.position);
		},
		[],
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
			<PredictionCurtainProvider>
				<div className="predictions-page__home-trade-grid">
					<div className="predictions-page__home-trade-main">{children}</div>
					{isDesktop && focusedUmbrella && (
						<div className="right-panel predictions-page__home-trade-panel">
							<UmbrellaTradeBoxPanel
								umbrella={focusedUmbrella}
								questionOrderbooks={questionOrderbooks}
								activeMarket={activeMarket}
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
							activeMarket={activeMarket}
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
