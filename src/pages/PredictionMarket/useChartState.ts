import { useEffect, useState, useRef } from "react";

type ChartState = {
	isInitialized: boolean;
	primaryMarket: any;
	secondaryMarket: any | null;
	primaryQuestionId: string;
	secondaryQuestionId: string | null;
	frozenOrderbooks: Record<string, any>;
};

export function useChartState(sortedQuestions: any[], questionOrderbooks: Record<string, any>) {
	const [chartOnlyState, setChartOnlyState] = useState<ChartState>({
		isInitialized: false,
		primaryMarket: null,
		secondaryMarket: null,
		primaryQuestionId: "",
		secondaryQuestionId: null,
		frozenOrderbooks: {},
	});

	// Store orderbooks in a ref to avoid triggering re-renders
	const orderbooksRef = useRef(questionOrderbooks);
	orderbooksRef.current = questionOrderbooks;

	// Initialize/update chart state based on sorted questions ONLY
	useEffect(() => {
		if (sortedQuestions.length > 0) {
			const primaryQuestionId = (sortedQuestions[0]._id ||
				sortedQuestions[0].questionId ||
				sortedQuestions[0].marketId ||
				"") as string;
			const secondaryQuestionId =
				sortedQuestions.length > 1
					? sortedQuestions[1]._id || sortedQuestions[1].questionId || sortedQuestions[1].marketId
					: null;

			// Only update if the markets actually changed
			const marketsChanged =
				primaryQuestionId !== chartOnlyState.primaryQuestionId ||
				secondaryQuestionId !== chartOnlyState.secondaryQuestionId;

			if (marketsChanged) {
				const primaryMarket = { ...sortedQuestions[0] };
				const secondaryMarket = sortedQuestions.length > 1 ? { ...sortedQuestions[1] } : null;

				setChartOnlyState((prev) => ({
					...prev,
					isInitialized: true,
					primaryMarket,
					secondaryMarket,
					primaryQuestionId,
					secondaryQuestionId,
					// Keep the same frozenOrderbooks reference to avoid triggering re-renders
				}));
			}
		}
	}, [sortedQuestions, chartOnlyState.primaryQuestionId, chartOnlyState.secondaryQuestionId]);

	// Chart uses frozen data from global context - no additional API calls needed

	return chartOnlyState;
}
