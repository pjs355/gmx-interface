/**
 * TransfersModal — multi-chain withdrawals via POST /funding/lifi/withdraw/plan
 * (LI.FI routes + same-chain EVM direct transfer when applicable).
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import Modal from "@/components/Modal/Modal";
import { useTransfersModal } from "@/context/TransfersModalContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useSignerContext } from "@/context/SignerContext";
import { useUserData } from "@/context/UserDataContext";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { useBridgeFundingBalances } from "@/trading/hooks/useBridgeFundingBalances";
import { buildChainBalances } from "@/trading/sor/SmartRouteToggle";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import {
	useWithdrawPlanExecution,
	getWithdrawExecutionErrorMessage,
} from "@/pages/Transfers/useWithdrawPlanExecution";
import type {
	LifiWithdrawPlanData,
	LifiWithdrawPlanLeg,
} from "@/types/trading";
import type { WithdrawPlanTxEntry } from "@/pages/Transfers/useWithdrawPlanExecution";
import "./TransfersModal.scss";

type ModalView = "withdraw" | "review" | "submitted";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const SOLANA_LIFI_CHAIN_ID = 1151111081099710;

const DEST_CHAINS: { label: string; chainId: number }[] = [
	{ label: "Base", chainId: 8453 },
	{ label: "Polygon", chainId: 137 },
	{ label: "BNB Chain", chainId: 56 },
	{ label: "Solana", chainId: SOLANA_LIFI_CHAIN_ID },
];

function explorerTxUrl(chainId: number, txHash: string): string {
	const h = txHash.trim();
	if (chainId === 8453) return `https://basescan.org/tx/${h}`;
	if (chainId === 137) return `https://polygonscan.com/tx/${h}`;
	if (chainId === 56) return `https://bscscan.com/tx/${h}`;
	return `https://solscan.io/tx/${h}`;
}

function chainLabel(chainId: number): string {
	return DEST_CHAINS.find((c) => c.chainId === chainId)?.label ?? `Chain ${chainId}`;
}

function legAmountLabel(leg: LifiWithdrawPlanLeg): string {
	if (leg.mode === "direct_transfer") {
		return `$${leg.amountHuman}`;
	}
	try {
		const raw = BigInt(leg.fromAmount);
		const d = leg.fromFundingStable.decimals;
		const human = Number(raw) / 10 ** d;
		if (!Number.isFinite(human)) return "—";
		return `$${human.toFixed(2)}`;
	} catch {
		return "—";
	}
}

function legRouteType(leg: LifiWithdrawPlanLeg): string {
	return leg.mode === "direct_transfer" ? "Direct" : "LI.FI";
}

function legSourceLabel(leg: LifiWithdrawPlanLeg): string {
	if (leg.mode === "direct_transfer") {
		return chainLabel(leg.toChain);
	}
	return `${chainLabel(leg.fromChain)} → ${chainLabel(leg.toChain)}`;
}

export function TransfersModal() {
	const { isOpen, closeModal } = useTransfersModal();
	const { cashBalance } = usePortfolio();
	const { account } = useSignerContext();
	const { refresh: refreshUserData, usdcBalance } = useUserData();
	const funding = useFundingAddresses();
	const api = usePrivateApiClient();
	const { executePlan } = useWithdrawPlanExecution();

	const bridgeBalances = useBridgeFundingBalances({
		baseSmartWallet: funding.baseSmartWallet,
		polymarketSafe: funding.polymarketSafe,
		embeddedEoa: funding.embeddedEoa,
		solanaAddress: funding.solanaAddress,
		enabled: !funding.isLoading && Boolean(account),
	});

	const chainBalances = useMemo(
		() =>
			buildChainBalances({
				baseUsdcBalance: Number(usdcBalance) || 0,
				baseWalletAddress: funding.baseSmartWallet ?? "",
				polygonUsdcBalance: parseFloat(
					bridgeBalances.data?.polygonUsdcEHuman ?? "0"
				),
				polygonWalletAddress: funding.polymarketSafe,
				solanaUsdcBalance: parseFloat(
					bridgeBalances.data?.solanaUsdcHuman ?? "0"
				),
				solanaWalletAddress: funding.solanaAddress,
				bnbUsdtBalance: parseFloat(bridgeBalances.data?.bscUsdtHuman ?? "0"),
				bnbWalletAddress: funding.embeddedEoa,
			}),
		[
			usdcBalance,
			funding.baseSmartWallet,
			funding.polymarketSafe,
			funding.embeddedEoa,
			funding.solanaAddress,
			bridgeBalances.data,
		]
	);

	const totalFundingOnRails = useMemo(
		() =>
			chainBalances.reduce((sum, b) => {
				const n =
					typeof b.balance === "number" && Number.isFinite(b.balance)
						? b.balance
						: 0;
				return sum + n;
			}, 0),
		[chainBalances]
	);

	/** Withdrawable total: portfolio cash capped by balances reported on funding chains. */
	const maxWithdrawAmount = useMemo(
		() => Math.min(cashBalance, totalFundingOnRails),
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
	const [submittedEntries, setSubmittedEntries] = useState<
		WithdrawPlanTxEntry[] | null
	>(null);
	const [plan, setPlan] = useState<LifiWithdrawPlanData | null>(null);

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
				setSubmittedEntries(null);
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

	const destIsSolana = toChain === SOLANA_LIFI_CHAIN_ID;
	const networkChosen = toChain !== null;
	const assetChosen = toAsset !== null;
	const addressHasInput = recipientAddress.length > 0;
	const isAddressValid = destIsSolana
		? SOLANA_ADDRESS_RE.test(recipientAddress.trim())
		: EVM_ADDRESS_RE.test(recipientAddress.trim());
	const isAddressInvalid = addressHasInput && !isAddressValid;

	const amountHasInput = withdrawAmount.length > 0;
	const parsedAmount = parseFloat(withdrawAmount);
	const isAmountOverMaxWithdraw =
		amountHasInput &&
		!isNaN(parsedAmount) &&
		maxWithdrawAmount > 0 &&
		parsedAmount > maxWithdrawAmount + 1e-9;
	const isAmountValid =
		amountHasInput &&
		!isNaN(parsedAmount) &&
		parsedAmount > 0 &&
		parsedAmount <= maxWithdrawAmount + 1e-9 &&
		chainBalances.length > 0;

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
			const planPayload = await api.postFundingLifiWithdrawPlan({
				amountHuman: withdrawAmount.trim(),
				toChain,
				toAsset,
				toAddress: recipientAddress.trim(),
				slippage: 0.005,
				balances: chainBalances,
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
		canRequestReview,
		chainBalances,
		recipientAddress,
		toAsset,
		toChain,
		withdrawAmount,
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
		setSubmittedEntries(null);
		try {
			const out = await executePlan(plan);
			setSubmittedEntries(out.entries);
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
			case "submitted":
				return "Withdrawal Submitted";
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

	const routeSummary = useMemo(() => {
		if (!plan) return null;
		if (plan.mode === "composite") {
			return `${plan.legs.length} steps from your funded wallets`;
		}
		if (plan.mode === "direct_transfer") {
			return `Send on ${chainLabel(plan.toChain)} (direct transfer)`;
		}
		return `Routed via LI.FI from ${chainLabel(plan.fromChain)} → ${chainLabel(plan.toChain)}`;
	}, [plan]);

	const renderWithdrawView = () => (
		<div className="transfers-withdraw-form">
			{error && (
				<div className="transfers-error-message" role="alert">
					<span className="transfers-error-text">{error}</span>
				</div>
			)}
			{chainBalances.length === 0 && (
				<div className="transfers-field-error" style={{ marginBottom: 12 }}>
					No funded wallets detected yet. Deposit or wait for balances to load.
				</div>
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
					{totalFundingOnRails > 0 &&
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

			<div className="transfers-network-notice">
				Withdrawals may route from Base, Polygon, BNB, or Solana depending on where
				your cash is held. Always verify the recipient network and asset; wrong
				details can mean permanent loss.
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

			<p className="transfers-review-warning">
				Please review the details below. Blockchain transfers cannot be reversed.
			</p>

			<div className="transfers-review-details">
				<div className="transfers-review-row">
					<span className="transfers-review-label">Route</span>
					<span className="transfers-review-value">{routeSummary ?? "—"}</span>
				</div>
				{plan?.mode === "composite" && (
					<div className="transfers-review-legs-wrap">
						<table className="transfers-review-legs">
							<thead>
								<tr>
									<th scope="col">#</th>
									<th scope="col">Source / path</th>
									<th scope="col">Type</th>
									<th scope="col">Amount</th>
								</tr>
							</thead>
							<tbody>
								{plan.legs.map((leg, idx) => (
									<tr key={`${leg.mode}-${idx}`}>
										<td>{idx + 1}</td>
										<td>{legSourceLabel(leg)}</td>
										<td>{legRouteType(leg)}</td>
										<td>{legAmountLabel(leg)}</td>
									</tr>
								))}
							</tbody>
						</table>
						<p className="transfers-review-legs-note">
							Steps run in order. If one step fails, earlier steps may already
							have settled on-chain.
						</p>
					</div>
				)}
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
					<span className="transfers-review-label">Amount</span>
					<span className="transfers-review-value transfers-review-amount">
						${formatCurrency(withdrawAmount)}
					</span>
				</div>
			</div>

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
			<h3 className="transfers-confirmation-title">Withdrawal Submitted</h3>

			<div className="transfers-confirmation-details">
				<div className="transfers-confirmation-row">
					<span className="transfers-confirmation-label">Destination</span>
					<span className="transfers-confirmation-value">
						{toChain != null && toAsset != null
							? `${chainLabel(toChain)} · ${toAsset}`
							: "—"}
					</span>
				</div>
				<div className="transfers-confirmation-row">
					<span className="transfers-confirmation-label">Recipient</span>
					<span className="transfers-confirmation-value address">
						{recipientAddress}
					</span>
				</div>
				<div className="transfers-confirmation-row">
					<span className="transfers-confirmation-label">Amount</span>
					<span className="transfers-confirmation-value amount">
						${formatCurrency(withdrawAmount)}
					</span>
				</div>
				{submittedEntries && submittedEntries.length > 0 && (
					<div className="transfers-confirmation-txs">
						<span className="transfers-confirmation-label">
							{submittedEntries.length > 1 ? "Transactions" : "Transaction"}
						</span>
						<ul className="transfers-confirmation-tx-list">
							{submittedEntries.map((e, i) => (
								<li key={`${e.txHash}-${i}`}>
									<a
										className="transfers-confirmation-value tx-link"
										href={explorerTxUrl(e.explorerChainId, e.txHash)}
										target="_blank"
										rel="noopener noreferrer"
									>
										{submittedEntries.length > 1
											? `Step ${i + 1} on ${chainLabel(e.explorerChainId)}`
											: "View on explorer"}
									</a>
								</li>
							))}
						</ul>
					</div>
				)}
			</div>

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
			label={getModalTitle()}
			noDivider={view === "submitted"}
		>
			{renderContent()}
		</Modal>
	);
}

export default TransfersModal;
