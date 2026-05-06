/**
 * TransfersModal — multi-chain withdrawals via POST /funding/lifi/withdraw/plan
 * (LI.FI routes + same-chain EVM direct transfer when applicable).
 *
 * When the withdrawal amount exceeds Base smart wallet USDC but Limitless maker on Base
 * can cover the gap, we consolidate maker → SCW (partner withdraw) before planning so
 * Li.FI always sources from the SCW.
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Tooltip from "@/components/Tooltip/Tooltip";
import Modal from "@/components/Modal/Modal";
import { useTransfersModal } from "@/context/TransfersModalContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useSignerContext } from "@/context/SignerContext";
import { useUserData } from "@/context/UserDataContext";
import { useAccountData } from "@/context/AccountDataContext";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { buildChainBalances } from "@/trading/sor/buildChainBalances";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import {
	useWithdrawPlanExecution,
	getWithdrawExecutionErrorMessage,
} from "@/pages/Transfers/useWithdrawPlanExecution";
import { prefundLimitlessMakerToScwForTransfersWithdraw } from "@/pages/Transfers/prefundLimitlessMakerToScwForTransfersWithdraw";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/trading/hooks/useBridgeFundingBalances";
import { readFundingStableBalancesHuman } from "@/trading/sor/fundingStableBalances";
import type { LifiWithdrawPlanData, LifiWithdrawPlanLeg } from "@/types/trading";
import "./TransfersModal.scss";

type ModalView = "withdraw" | "review" | "submitted";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const SOLANA_LIFI_CHAIN_ID = 1151111081099710;

/**
 * Withdraw "type-the-displayed-balance ⇒ send max" tolerance.
 *
 * `cashBalance` and on-chain stable balances arrive with up to 6 decimals
 * (e.g. `6.749876` USDT on BNB), but the available figure is shown floored
 * to 2 dp ($6.75). Users naturally retype that displayed number, which is
 * almost always a hair ABOVE the actual penny-truncated maximum.
 *
 * Mirror the share-sell clamp (see `SHARE_SELL_COMPARE_EPS` in
 * `checkBalances.ts`): when the input is within 1¢ of the cap, treat it
 * as "send max" — relax the over-cap validator AND substitute the exact
 * `maxWithdrawAmount` in the value forwarded to the plan API so we never
 * overshoot the actual on-chain balance.
 */
const WITHDRAW_AMOUNT_COMPARE_EPS = 0.01;

/** Stable token (USDC/USDT) precision is 6 decimals; trim trailing zeros. */
function formatStableAmountHuman(amount: number): string {
	if (!Number.isFinite(amount) || amount <= 0) return "0";
	return amount.toFixed(6).replace(/\.?0+$/, "");
}

const DEST_CHAINS: { label: string; chainId: number }[] = [
	{ label: "Base", chainId: 8453 },
	{ label: "Polygon", chainId: 137 },
	{ label: "BNB Chain", chainId: 56 },
	{ label: "Solana", chainId: SOLANA_LIFI_CHAIN_ID },
];

function chainLabel(chainId: number): string {
	return DEST_CHAINS.find((c) => c.chainId === chainId)?.label ?? `Chain ${chainId}`;
}

function collectWithdrawLegs(plan: LifiWithdrawPlanData): LifiWithdrawPlanLeg[] {
	if (plan.mode === "composite") return plan.legs;
	return [plan];
}

function sumUsdFromCostArray(arr: unknown): number {
	if (!Array.isArray(arr)) return 0;
	let sum = 0;
	for (const item of arr) {
		if (!item || typeof item !== "object") continue;
		const raw = (item as Record<string, unknown>).amountUSD;
		const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
		if (Number.isFinite(n)) sum += n;
	}
	return sum;
}

/** LI.FI protocol / bridge fee line items only (USD). Excludes `gasCosts` — gas is sponsored separately. */
function sumLifiProtocolFeeUsd(quote: unknown): number {
	if (!quote || typeof quote !== "object") return 0;
	const est = (quote as Record<string, unknown>).estimate;
	if (!est || typeof est !== "object") return 0;
	return sumUsdFromCostArray((est as Record<string, unknown>).feeCosts);
}

/** Quoted destination stable received for this leg (human units on `destChainId`). */
function legDestinationReceiveHuman(
	leg: LifiWithdrawPlanLeg,
	destChainId: number
): number {
	if (leg.toChain !== destChainId) return 0;
	if (leg.mode === "direct_transfer") {
		const n = parseFloat(leg.amountHuman);
		return Number.isFinite(n) ? n : 0;
	}
	const q = leg.quote as Record<string, unknown> | null | undefined;
	const est = q?.estimate as Record<string, unknown> | undefined;
	if (!est) return 0;
	const toAmt = est.toAmount;
	if (typeof toAmt === "string" || typeof toAmt === "number") {
		try {
			const raw = BigInt(String(toAmt));
			const dec = leg.toFundingStable.decimals;
			return Number(raw) / 10 ** dec;
		} catch {
			/* fall through */
		}
	}
	const toUsd = parseFloat(String(est.toAmountUSD ?? ""));
	return Number.isFinite(toUsd) ? toUsd : 0;
}

export function TransfersModal() {
	const { isOpen, closeModal } = useTransfersModal();
	const { cashBalance } = usePortfolio();
	const { account } = useSignerContext();
	const { refresh: refreshUserData } = useUserData();
	const { cash: accountCash, refresh: refreshAccount } = useAccountData();
	const funding = useFundingAddresses();
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();
	const { executePlan } = useWithdrawPlanExecution();

	// Display balances come from the server's `/portfolio/cash-summary`
	// snapshot (already aggregated across all five wallets), not from a
	// duplicate per-chain RPC fan-out. The transactional `readFundingStableBalancesHuman`
	// reads further below stay in place — those are the verify-before-tx
	// path, not display.
	const chainBalances = useMemo(
		() =>
			buildChainBalances({
				baseUsdcBalance: accountCash.base,
				baseWalletAddress: funding.baseSmartWallet ?? "",
				polygonUsdcBalance: accountCash.polygon,
				polygonWalletAddress: funding.polymarketSafe,
				solanaUsdcBalance: accountCash.solana,
				solanaWalletAddress: funding.solanaAddress,
				bnbUsdtBalance: accountCash.bnb,
				bnbWalletAddress: funding.embeddedEoa,
			}),
		[
			accountCash.base,
			accountCash.polygon,
			accountCash.solana,
			accountCash.bnb,
			funding.baseSmartWallet,
			funding.polymarketSafe,
			funding.embeddedEoa,
			funding.solanaAddress,
		]
	);

	const limitlessOnMaker = Math.max(0, accountCash.limitlessMaker || 0);

	const totalFundingOnRails = useMemo(
		() =>
			chainBalances.reduce((sum, b) => {
				const n =
					typeof b.balance === "number" && Number.isFinite(b.balance)
						? b.balance
						: 0;
				return sum + n;
			}, 0) + limitlessOnMaker,
		[chainBalances, limitlessOnMaker]
	);

	/** Withdrawable total: portfolio cash capped by balances reported on funding chains. */
	const maxWithdrawAmount = useMemo(
		() =>
			cashBalance === null
				? 0
				: Math.min(cashBalance, totalFundingOnRails),
		[cashBalance, totalFundingOnRails]
	);

	const [view, setView] = useState<ModalView>("withdraw");
	const [toChain, setToChain] = useState<number | null>(null);
	const [toAsset, setToAsset] = useState<"USDC" | "USDT" | null>(null);
	const [recipientAddress, setRecipientAddress] = useState("");
	const [withdrawAmount, setWithdrawAmount] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isPlanning, setIsPlanning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [plan, setPlan] = useState<LifiWithdrawPlanData | null>(null);

	const amountHasInput = withdrawAmount.length > 0;
	const parsedAmount = parseFloat(withdrawAmount);
	const isAmountWithinSendMaxClamp =
		amountHasInput &&
		!isNaN(parsedAmount) &&
		maxWithdrawAmount > 0 &&
		Math.abs(parsedAmount - maxWithdrawAmount) <= WITHDRAW_AMOUNT_COMPARE_EPS;
	/**
	 * Amount actually forwarded downstream (validation, prefund math, plan API,
	 * review screen). When the user types within 1¢ of the cap, use the exact
	 * `maxWithdrawAmount` so the route can drain dust precisely.
	 */
	const effectiveWithdrawAmount = isAmountWithinSendMaxClamp
		? maxWithdrawAmount
		: !isNaN(parsedAmount)
			? parsedAmount
			: 0;
	const effectiveWithdrawAmountStr = isAmountWithinSendMaxClamp
		? formatStableAmountHuman(maxWithdrawAmount)
		: withdrawAmount.trim();
	const isAmountOverMaxWithdraw =
		amountHasInput &&
		!isNaN(parsedAmount) &&
		maxWithdrawAmount > 0 &&
		parsedAmount > maxWithdrawAmount + WITHDRAW_AMOUNT_COMPARE_EPS;
	const isAmountValid =
		amountHasInput &&
		!isNaN(parsedAmount) &&
		parsedAmount > 0 &&
		parsedAmount <= maxWithdrawAmount + WITHDRAW_AMOUNT_COMPARE_EPS &&
		chainBalances.length > 0;

	/**
	 * Protocol fees (LI.FI feeCosts) + route spread (remainder to match send vs receive).
	 * combinedCostUsd = protocolFees + routeSpread (2dp). Gas excluded.
	 */
	const reviewFeeAndReceive = useMemo(() => {
		const grossHuman = effectiveWithdrawAmount;
		if (
			!plan ||
			toChain == null ||
			!Number.isFinite(grossHuman) ||
			grossHuman <= 0
		) {
			return {
				requestHuman: 0,
				protocolFeesUsd: 0,
				routeSpreadUsd: 0,
				combinedCostUsd: 0,
				receiveHuman: 0,
			};
		}
		const legs = collectWithdrawLegs(plan);
		let protocolFeesSum = 0;
		for (const leg of legs) {
			if (leg.mode === "lifi" && leg.quote) {
				protocolFeesSum += sumLifiProtocolFeeUsd(leg.quote);
			}
		}
		let receiveHuman = 0;
		for (const leg of legs) {
			receiveHuman += legDestinationReceiveHuman(leg, toChain);
		}
		if (receiveHuman <= 1e-9 && grossHuman > 0) {
			receiveHuman = Math.max(0, grossHuman - protocolFeesSum);
		}
		const reqC = Math.round(grossHuman * 100) / 100;
		const feeC = Math.round(protocolFeesSum * 100) / 100;
		const recvC = Math.round(receiveHuman * 100) / 100;
		const routeSpreadUsd = Math.max(
			0,
			Math.round((reqC - feeC - recvC) * 100) / 100
		);
		const combinedCostUsd = Math.round((feeC + routeSpreadUsd) * 100) / 100;
		return {
			requestHuman: grossHuman,
			protocolFeesUsd: feeC,
			routeSpreadUsd,
			combinedCostUsd,
			receiveHuman,
		};
	}, [plan, effectiveWithdrawAmount, toChain]);

	useEffect(() => {
		if (!isOpen) {
			const timer = setTimeout(() => {
				setView("withdraw");
				setToChain(null);
				setToAsset(null);
				setRecipientAddress("");
				setWithdrawAmount("");
				setError(null);
				setIsSubmitting(false);
				setIsPlanning(false);
				setPlan(null);
			}, 200);
			return () => clearTimeout(timer);
		}
	}, [isOpen]);

	const formatCurrency = useCallback((value: number | null | string): string => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		if (num === null || !isFinite(num)) return "0.00";
		return new Intl.NumberFormat("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(num);
	}, []);

	const estimatedCostTooltipContent = useMemo(
		() => (
			<div className="transfers-fee-tooltip">
				<p>Protocol fees: ${formatCurrency(reviewFeeAndReceive.protocolFeesUsd)}</p>
				<p>Route spread: ${formatCurrency(reviewFeeAndReceive.routeSpreadUsd)}</p>
				<p>Gas is sponsored (not in this total).</p>
			</div>
		),
		[
			formatCurrency,
			reviewFeeAndReceive.protocolFeesUsd,
			reviewFeeAndReceive.routeSpreadUsd,
		]
	);

	const destIsSolana = toChain === SOLANA_LIFI_CHAIN_ID;
	const networkChosen = toChain !== null;
	const assetChosen = toAsset !== null;
	const addressHasInput = recipientAddress.length > 0;
	const isAddressValid = destIsSolana
		? SOLANA_ADDRESS_RE.test(recipientAddress.trim())
		: EVM_ADDRESS_RE.test(recipientAddress.trim());
	const isAddressInvalid = addressHasInput && !isAddressValid;

	const canRequestReview =
		networkChosen &&
		assetChosen &&
		isAddressValid &&
		isAmountValid &&
		chainBalances.length > 0;

	const handleProceedToReview = useCallback(async () => {
		if (!canRequestReview || toChain === null || toAsset === null) return;
		setError(null);
		setIsPlanning(true);
		setPlan(null);
		try {
			const gross = effectiveWithdrawAmount;
			const fundingSnap = {
				baseSmartWallet: funding.baseSmartWallet?.trim() || null,
				limitlessMakerBase: funding.limitlessMakerBase?.trim() || null,
				polymarketSafe: funding.polymarketSafe?.trim() || null,
				embeddedEoa: funding.embeddedEoa?.trim() || null,
				solanaAddress: funding.solanaAddress?.trim() || null,
			};
			let balancesSnap = await readFundingStableBalancesHuman(fundingSnap);
			const scwBase = Math.max(0, balancesSnap.base ?? 0);
			const makerSnap = Math.max(0, balancesSnap.limitlessMakerBase ?? 0);
			/* Only sweep maker → SCW when no other chain can plug the gap.
			 * The naive `min(gross - scwBase, maker)` triggers a partner
			 * withdraw + 120s poll on every transfer that the SCW alone
			 * doesn't cover — even when Solana / Polygon / BNB already hold
			 * plenty of stable for Li.Fi to source from. The user perceives
			 * that wait as "Getting route…" being stuck.
			 *
			 * Treat USDC + USDT 1:1 here — exact swap math happens inside
			 * `postFundingLifiWithdrawPlan`; this gate is only deciding
			 * whether the maker sweep is necessary.
			 */
			const otherChainsTotal =
				Math.max(0, balancesSnap.polygon ?? 0) +
				Math.max(0, balancesSnap.solana ?? 0) +
				Math.max(0, balancesSnap.bnb ?? 0);
			const shortfallExcludingMaker = Math.max(
				0,
				gross - scwBase - otherChainsTotal,
			);
			const pullFromMaker = Math.min(shortfallExcludingMaker, makerSnap);
			if (pullFromMaker >= 0.02) {
				await prefundLimitlessMakerToScwForTransfersWithdraw({
					amountFromMakerHuman: pullFromMaker,
					funding: {
						baseSmartWallet: funding.baseSmartWallet,
						limitlessMakerBase: funding.limitlessMakerBase,
					},
					privateApi: api,
				});
				// `BRIDGE_FUNDING_BALANCES_QUERY_KEY` is still consumed by the
				// SOR / useBridgeFlow transaction-time path; invalidate it so
				// those callers re-read the post-prefund balances. Refresh the
				// canonical cash snapshot so this modal's display updates too.
				await queryClient.invalidateQueries({
					queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY],
				});
				await refreshAccount.cash();
				await refreshUserData();
				balancesSnap = await readFundingStableBalancesHuman(fundingSnap);
			}
			const planBalances = buildChainBalances({
				baseUsdcBalance: Math.max(0, balancesSnap.base ?? 0),
				baseWalletAddress: funding.baseSmartWallet ?? "",
				polygonUsdcBalance: Math.max(0, balancesSnap.polygon ?? 0),
				polygonWalletAddress: funding.polymarketSafe,
				solanaUsdcBalance: Math.max(0, balancesSnap.solana ?? 0),
				solanaWalletAddress: funding.solanaAddress,
				bnbUsdtBalance: Math.max(0, balancesSnap.bnb ?? 0),
				bnbWalletAddress: funding.embeddedEoa,
			});

			const planPayload = await api.postFundingLifiWithdrawPlan({
				amountHuman: effectiveWithdrawAmountStr,
				toChain,
				toAsset,
				toAddress: recipientAddress.trim(),
				slippage: 0.005,
				balances: planBalances,
			});
			if (
				!planPayload ||
				typeof planPayload !== "object" ||
				(planPayload.mode !== "lifi" &&
					planPayload.mode !== "direct_transfer" &&
					planPayload.mode !== "composite")
			) {
				throw new Error("Withdraw plan failed");
			}
			setPlan(planPayload);
			setView("review");
		} catch (e) {
			setError(getWithdrawExecutionErrorMessage(e));
		} finally {
			setIsPlanning(false);
		}
	}, [
		api,
		refreshAccount,
		canRequestReview,
		effectiveWithdrawAmount,
		effectiveWithdrawAmountStr,
		funding.baseSmartWallet,
		funding.embeddedEoa,
		funding.limitlessMakerBase,
		funding.polymarketSafe,
		funding.solanaAddress,
		queryClient,
		recipientAddress,
		refreshUserData,
		toAsset,
		toChain,
	]);

	const handleBackToForm = useCallback(() => {
		setError(null);
		setPlan(null);
		setView("withdraw");
	}, []);

	const handleSendTransaction = useCallback(async () => {
		if (!plan) {
			setError("No withdrawal plan. Go back and try again.");
			return;
		}
		setIsSubmitting(true);
		setError(null);
		try {
			await executePlan(plan);
			setView("submitted");
			await refreshUserData();
		} catch (err) {
			setError(getWithdrawExecutionErrorMessage(err));
		} finally {
			setIsSubmitting(false);
		}
	}, [executePlan, plan, refreshUserData]);

	const handleDone = useCallback(() => {
		closeModal();
	}, [closeModal]);

	const handleCancel = useCallback(() => {
		closeModal();
	}, [closeModal]);

	const getModalTitle = (): string => {
		switch (view) {
			case "review":
				return "Review Withdrawal";
			default:
				return "Withdraw funds";
		}
	};

	const getAddressInputClass = () => {
		let classes = "transfers-address-input";
		if (isAddressValid) classes += " input-valid";
		if (isAddressInvalid) classes += " input-error";
		return classes;
	};

	const getAmountInputClass = () => {
		let classes = "";
		if (isAmountOverMaxWithdraw) classes += " input-error";
		return classes;
	};

	const renderWithdrawView = () => (
		<div className="transfers-withdraw-form">
			{error && (
				<div className="transfers-error-message" role="alert">
					<span className="transfers-error-text">{error}</span>
				</div>
			)}
			{chainBalances.length === 0 && (
				accountCash.status === "pending" || !accountCash.isFetched ? (
					<div className="transfers-field-loading" style={{ marginBottom: 12 }}>
						Loading wallet balances…
					</div>
				) : (
					<div className="transfers-field-error" style={{ marginBottom: 12 }}>
						No funded wallets detected yet. Deposit or wait for balances to load.
					</div>
				)
			)}

			<div className="transfers-input-group">
				<label>Destination network</label>
				<div
					className="transfers-pill-row"
					role="group"
					aria-label="Destination network"
				>
					{DEST_CHAINS.map((c) => (
						<button
							key={c.chainId}
							type="button"
							className={
								toChain === c.chainId
									? "transfers-pill transfers-pill--active"
									: "transfers-pill"
							}
							onClick={() => setToChain(c.chainId)}
						>
							{c.label}
						</button>
					))}
				</div>
			</div>

			<div className="transfers-input-group">
				<label>Asset</label>
				<div className="transfers-pill-row" role="group" aria-label="Asset">
					{(["USDC", "USDT"] as const).map((sym) => (
						<button
							key={sym}
							type="button"
							className={
								toAsset === sym
									? "transfers-pill transfers-pill--active"
									: "transfers-pill"
							}
							onClick={() => setToAsset(sym)}
						>
							{sym}
						</button>
					))}
				</div>
			</div>

			<div className="transfers-input-group">
				<label>Recipient address</label>
				<input
					type="text"
					className={getAddressInputClass()}
					placeholder={
						!networkChosen
							? "Select network first…"
							: destIsSolana
								? "Solana address…"
								: "0x…"
					}
					value={recipientAddress}
					onChange={(e) => setRecipientAddress(e.target.value)}
					disabled={!networkChosen}
				/>
				{networkChosen && isAddressInvalid && (
					<div className="transfers-field-error">
						Invalid {destIsSolana ? "Solana" : "EVM"} address
					</div>
				)}
			</div>

			<div className="transfers-input-group">
				<label>Amount</label>
				<input
					type="number"
					className={getAmountInputClass()}
					placeholder="0.00"
					value={withdrawAmount}
					onChange={(e) => setWithdrawAmount(e.target.value)}
					step="0.01"
					min="0"
				/>
				<div className="transfers-available">
					Cash across wallets:{" "}
					<span>${formatCurrency(cashBalance)}</span>
					{cashBalance !== null &&
						totalFundingOnRails > 0 &&
						totalFundingOnRails + 1e-6 < cashBalance && (
							<span className="transfers-available-cap">
								{" "}
								· Withdrawable now:{" "}
								<span>${formatCurrency(maxWithdrawAmount)}</span> (funded
								on-chain balances)
							</span>
						)}
				</div>
				{isAmountOverMaxWithdraw && (
					<div className="transfers-field-error">
						Amount exceeds what you can withdraw (${formatCurrency(maxWithdrawAmount)}{" "}
						available).
					</div>
				)}
			</div>

			<div className="transfers-form-actions">
				<button
					type="button"
					className="transfers-btn-confirm"
					onClick={() => void handleProceedToReview()}
					disabled={!canRequestReview || isPlanning}
				>
					{isPlanning ? "Getting route…" : "Continue"}
				</button>
				<button
					type="button"
					className="transfers-btn-cancel"
					onClick={handleCancel}
					disabled={isPlanning}
				>
					Cancel
				</button>
			</div>
		</div>
	);

	const renderReviewView = () => (
		<div className="transfers-review">
			{error && (
				<div className="transfers-error-message">
					<span className="transfers-error-text">{error}</span>
				</div>
			)}

			<div className="transfers-review-details">
				<div className="transfers-review-row">
					<span className="transfers-review-label">Destination</span>
					<span className="transfers-review-value">
						{toChain != null && toAsset != null
							? `${chainLabel(toChain)} · ${toAsset}`
							: "—"}
					</span>
				</div>
				<div className="transfers-review-row">
					<span className="transfers-review-label">Recipient</span>
					<span className="transfers-review-value transfers-review-address">
						{recipientAddress}
					</span>
				</div>
				<div className="transfers-review-row">
					<span className="transfers-review-label">{"You're sending"}</span>
					<span className="transfers-review-value">
						${formatCurrency(reviewFeeAndReceive.requestHuman)}
					</span>
				</div>
				<div className="transfers-review-row">
					<Tooltip
						content={estimatedCostTooltipContent}
						position="top"
						withPortal={true}
						tooltipClassName="transfers-fee-tooltip-popup"
					>
						<span className="transfers-review-label transfers-review-label--fees">
							Estimated cost
						</span>
					</Tooltip>
					<span className="transfers-review-value">
						${formatCurrency(reviewFeeAndReceive.combinedCostUsd)}
					</span>
				</div>
				<div className="transfers-review-row">
					<span className="transfers-review-label">
						You receive{toAsset != null ? ` (${toAsset})` : ""}
					</span>
					<span className="transfers-review-value transfers-review-amount">
						${formatCurrency(reviewFeeAndReceive.receiveHuman)}
					</span>
				</div>
			</div>

			<p className="transfers-review-irreversible">
				Fund transfers cannot be reversed.
			</p>

			<div className="transfers-form-actions">
				<button
					type="button"
					className="transfers-btn-send"
					onClick={() => void handleSendTransaction()}
					disabled={isSubmitting || !plan}
				>
					{isSubmitting ? (
						<span className="transfers-btn-loading">
							<span className="transfers-spinner" />
							Sending…
						</span>
					) : (
						"Send"
					)}
				</button>
				<button
					type="button"
					className="transfers-btn-cancel"
					onClick={handleBackToForm}
					disabled={isSubmitting}
				>
					Back
				</button>
			</div>
		</div>
	);

	const renderSubmittedView = () => (
		<div className="transfers-confirmation">
			<div className="transfers-confirmation-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<polyline points="20 6 9 17 4 12" />
				</svg>
			</div>
			<p className="transfers-confirmation-title">Withdrawal Submitted</p>

			<button type="button" className="transfers-btn-done" onClick={handleDone}>
				Done
			</button>
		</div>
	);

	const renderContent = () => {
		switch (view) {
			case "review":
				return renderReviewView();
			case "submitted":
				return renderSubmittedView();
			default:
				return renderWithdrawView();
		}
	};

	return (
		<Modal
			className="transfers-modal"
			isVisible={isOpen}
			setIsVisible={(visible) => {
				if (!visible) closeModal();
			}}
			label={view === "submitted" ? undefined : getModalTitle()}
			noDivider={view === "submitted"}
		>
			{renderContent()}
		</Modal>
	);
}

export default TransfersModal;
