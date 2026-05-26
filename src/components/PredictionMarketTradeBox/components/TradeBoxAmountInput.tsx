import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { mixpanelTrack } from "@/shared/analytics/mixpanel";
import {
	SHARE_SELL_COMPARE_EPS,
	clampSellSharesNumeric,
	clampedSellSharesAmountString,
} from "@/features/trading/trade-box/checkBalances";

function formatNumberWithCommas(value: string): string {
	if (!value) return "";

	const parts = value.split(".");
	const integerPart = parts[0];
	const decimalPart = parts[1];
	const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

	if (decimalPart !== undefined) {
		return `${formattedInteger}.${decimalPart}`;
	}

	return formattedInteger;
}

export interface TradeBoxAmountInputProps {
	market: PredictionMarket;
	side: "buy" | "sell";
	orderType: "market" | "limit";
	selectedPosition: "yes" | "no" | null;
	amount: string;
	amountInputShowsDollarPrefix: boolean;
	shareAmountRequiresWholeContracts: boolean;
	sellFieldsLocked: boolean;
	tradeInteractionLocked: boolean;
	maxScopedSellShares: number;
	onAmountChange: (amount: string) => void;
}

export default function TradeBoxAmountInput({
	market,
	side,
	orderType,
	selectedPosition,
	amount,
	amountInputShowsDollarPrefix,
	shareAmountRequiresWholeContracts,
	sellFieldsLocked,
	tradeInteractionLocked,
	maxScopedSellShares,
	onAmountChange,
}: TradeBoxAmountInputProps) {
	return (
		<div className="input-section">
			<div className="input-label">{side === "sell" ? "Shares" : "Amount"}</div>
			<div
				className={`input-container prediction-input-container ${!amount || amount === "" ? "empty-input" : ""}`}
			>
				<input
					data-qa="tradebox-amount-input"
					type="text"
					disabled={sellFieldsLocked || tradeInteractionLocked}
					value={
						amount
							? amountInputShowsDollarPrefix
								? `$${formatNumberWithCommas(amount)}`
								: formatNumberWithCommas(amount)
							: ""
					}
					onFocus={() => {
						try {
							mixpanelTrack("AmountInputFocused", {
								marketId: market?._id || market?.questionId,
								marketName: market?.displayName || market?.question,
								orderType,
								side,
								selectedPosition,
							});
						} catch (error) {
							console.error("error", error);
						}
					}}
					onChange={(e) => {
						const value = e.target.value;
						const cleanValue = value.replace(/[$,\s]/g, "");

						if (shareAmountRequiresWholeContracts) {
							if (cleanValue.includes(".")) {
								return;
							}
							if (!/^\d*$/.test(cleanValue)) {
								return;
							}
						} else {
							const decimalCount = (cleanValue.match(/\./g) || []).length;
							if (decimalCount > 1) {
								return;
							}
							const maxFractionDigits = amountInputShowsDollarPrefix ? 2 : side === "sell" ? 2 : 8;
							const frac = cleanValue.includes(".") ? cleanValue.split(".")[1] : "";
							if (frac && frac.length > maxFractionDigits) {
								return;
							}
						}

						let next = cleanValue;
						if (
							side === "sell" &&
							!amountInputShowsDollarPrefix &&
							maxScopedSellShares > 0 &&
							cleanValue !== ""
						) {
							const n = parseFloat(cleanValue);
							if (Number.isFinite(n) && n > 0) {
								const clamped = clampSellSharesNumeric(
									n,
									maxScopedSellShares,
									shareAmountRequiresWholeContracts,
								);
								if (Math.abs(clamped - n) > SHARE_SELL_COMPARE_EPS) {
									next = clampedSellSharesAmountString(clamped, shareAmountRequiresWholeContracts);
								}
							}
						}

						onAmountChange(next);
					}}
					onKeyDown={(e) => {
						const char = e.key;
						const isNumber = /[0-9]/.test(char);
						const isDecimal = char === ".";
						const isControlKey = [
							"Backspace",
							"Delete",
							"Tab",
							"Enter",
							"ArrowLeft",
							"ArrowRight",
							"ArrowUp",
							"ArrowDown",
							"Home",
							"End",
						].includes(char);

						if (shareAmountRequiresWholeContracts && isDecimal) {
							e.preventDefault();
							return;
						}

						if (!isNumber && !isDecimal && !isControlKey) {
							e.preventDefault();
						}
					}}
					placeholder={amountInputShowsDollarPrefix ? "$0" : "0"}
					className="trade-input prediction-trade-input"
				/>
			</div>
		</div>
	);
}
