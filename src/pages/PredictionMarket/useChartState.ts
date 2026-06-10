import { useEffect, useState } from "react";
import { resolveThreeWayChartLegs } from "@/features/markets/listing/threeWayMoneyline";
import { getMarketId } from "./utils";

type ChartState = {
	isInitialized: boolean;
	primaryMarket: any;
	secondaryMarket: any | null;
	primaryQuestionId: string;
	secondaryQuestionId: string | null;
	frozenOrderbooks: Record<string, any>;
};

function resolveChartMarketPair(questions: any[]): {
	primary: any | null;
	secondary: any | null;
} {
	if (!questions?.length) return { primary: null, secondary: null };

	const threeWayLegs = resolveThreeWayChartLegs(questions);
	if (threeWayLegs.length > 0) {
		return {
			primary: threeWayLegs[0] ?? null,
			secondary: threeWayLegs[1] ?? null,
		};
	}

	return {
		primary: questions[0] ?? null,
		secondary: questions.length > 1 ? questions[1] : null,
	};
}

export function useChartState(sortedQuestions: any[], questionOrderbooks: Record<string, any>) {
	const [chartOnlyState, setChartOnlyState] = useState<ChartState>({
		isInitialized: false,
		primaryMarket: null,
		secondaryMarket: null,
		primaryQuestionId: "",
		secondaryQuestionId: null,
		frozenOrderbooks: {},
	});

	// Chart markets are pinned by leg identity (home/away for 3-way), not volume
	// sort or the user's active pill. Refresh snapshots when question data updates.
	useEffect(() => {
		const { primary, secondary } = resolveChartMarketPair(sortedQuestions);
		if (!primary) return;

		const primaryQuestionId = getMarketId(primary);
		const secondaryQuestionId = secondary ? getMarketId(secondary) : null;
		if (!primaryQuestionId) return;

		setChartOnlyState((prev) => {
			const idsChanged =
				primaryQuestionId !== prev.primaryQuestionId ||
				secondaryQuestionId !== prev.secondaryQuestionId;

			if (!prev.isInitialized || idsChanged) {
				return {
					...prev,
					isInitialized: true,
					primaryMarket: { ...primary },
					secondaryMarket: secondary ? { ...secondary } : null,
					primaryQuestionId,
					secondaryQuestionId,
				};
			}

			return prev;
		});
	}, [sortedQuestions]);

	return chartOnlyState;
}
