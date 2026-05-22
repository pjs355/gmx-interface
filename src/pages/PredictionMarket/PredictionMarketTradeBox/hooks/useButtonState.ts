import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAnimatedDots } from "../../../../hooks/useAnimatedDots";
import { useSetupActivationOptional } from "@/onboarding/SetupActivationContext";
import { EMPTY_TRADE_PREVIEW, type TradePreviewFields } from "../tradeQuote/types";
import type { AccountWalletGate } from "@/context/accountWallets";
import type { ButtonStateResult } from "./venueButtonState/types";
import { resolveButtonState } from "./venueButtonState/resolveButtonState";
import {
	BUTTON_LOADING_HOLD_MS,
	useStabilizedButtonResult,
} from "./venueButtonState/stabilizer";

export type { ButtonStateResult } from "./venueButtonState/types";

export function useButtonState({
	authenticated,
	account,
	fundingGate = { status: "ready", message: null },
	state,
	tradePreview = EMPTY_TRADE_PREVIEW,
	login,
	marketOrderHandler,
	usdcBalance,
	yesBalance,
	noBalance,
	checkSufficientBalance,
	checkSufficientShares,
	market,
	handleAddFunds,
	polymarketTrading,
	orderbookWalkPosition = undefined as "yes" | "no" | undefined,
	predictTrading = undefined,
	limitlessTrading = undefined,
	dflowProofVerified = undefined,
	dflowProofLoading = undefined,
	dflowStartProofFlow = undefined,
	sorMatchedVenues = undefined,
	sorState = undefined,
}: {
	authenticated: boolean;
	account: string | null | undefined;
	fundingGate?: AccountWalletGate;
	state: Parameters<typeof resolveButtonState>[0]["state"] & {
		isLoading: boolean;
	};
	tradePreview?: TradePreviewFields;
	login: () => void;
	marketOrderHandler: Parameters<typeof resolveButtonState>[0]["marketOrderHandler"];
	usdcBalance: unknown;
	yesBalance: unknown;
	noBalance: unknown;
	checkSufficientBalance: Parameters<
		typeof resolveButtonState
	>[0]["checkSufficientBalance"];
	checkSufficientShares: Parameters<
		typeof resolveButtonState
	>[0]["checkSufficientShares"];
	market: unknown;
	handleAddFunds: () => void;
	polymarketTrading?: Parameters<
		typeof resolveButtonState
	>[0]["polymarketTrading"];
	orderbookWalkPosition?: "yes" | "no";
	predictTrading?: Parameters<typeof resolveButtonState>[0]["predictTrading"];
	limitlessTrading?: Parameters<
		typeof resolveButtonState
	>[0]["limitlessTrading"];
	dflowProofVerified?: boolean;
	dflowProofLoading?: boolean;
	dflowStartProofFlow?: () => void | Promise<void>;
	sorMatchedVenues?: ReadonlySet<string>;
	sorState?: Parameters<typeof resolveButtonState>[0]["sorState"];
}): ButtonStateResult {
	const animatedDots = useAnimatedDots(400);
	const navigate = useNavigate();
	const setupActivation = useSetupActivationOptional();
	const globalSetupInProgress = Boolean(
		setupActivation?.anyInProgress || setupActivation?.onboardingActive,
	);
	const debouncedAmountForMinLabel = useDebouncedValue(state.amount ?? "", 300);

	const rawButtonState = useMemo(
		() =>
			resolveButtonState({
				authenticated,
				account,
				fundingGate,
				state,
				tradePreview,
				login,
				marketOrderHandler,
				usdcBalance,
				yesBalance,
				noBalance,
				checkSufficientBalance,
				checkSufficientShares,
				market,
				handleAddFunds,
				polymarketTrading,
				orderbookWalkPosition,
				predictTrading,
				limitlessTrading,
				dflowProofVerified,
				dflowProofLoading,
				dflowStartProofFlow,
				sorMatchedVenues,
				sorState,
				animatedDots,
				globalSetupInProgress,
				debouncedAmountForMinLabel,
				navigate,
			}),
		[
			authenticated,
			account,
			fundingGate,
			globalSetupInProgress,
			state,
			login,
			marketOrderHandler,
			usdcBalance,
			yesBalance,
			noBalance,
			checkSufficientBalance,
			checkSufficientShares,
			market,
			animatedDots,
			handleAddFunds,
			polymarketTrading,
			orderbookWalkPosition,
			predictTrading,
			limitlessTrading,
			dflowProofVerified,
			dflowProofLoading,
			dflowStartProofFlow,
			sorMatchedVenues,
			sorState,
			navigate,
			debouncedAmountForMinLabel,
			tradePreview,
		],
	);

	return useStabilizedButtonResult(rawButtonState, BUTTON_LOADING_HOLD_MS);
}
