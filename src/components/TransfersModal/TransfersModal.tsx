/**
 * TransfersModal - USDC Withdrawal Modal
 * 
 * PURPOSE:
 * Handles USDC withdrawals from user's wallet to any external address on Base network.
 * This replaced the old complex Payments page with a simple, focused withdrawal flow.
 * 
 * FLOW:
 * 1. "withdraw" view - User enters recipient address and amount
 *    - Validates address format (0x + 40 hex chars)
 *    - Validates amount doesn't exceed available cash balance
 *    - Shows warning about Base network compatibility
 * 
 * 2. "review" view - User confirms transaction details
 *    - Shows full recipient address (not truncated) for verification
 *    - Shows exact amount being sent
 *    - User can go back to edit or proceed to send
 * 
 * 3. "submitted" view - Transaction confirmation
 *    - Shows success with BaseScan link to view transaction
 *    - User clicks "Done" to close modal
 * 
 * TRANSACTION HANDLING:
 * - Smart wallets (email login): Uses Privy's useSmartWallets().getClientForChain()
 * - External wallets: Uses ethers signer.sendTransaction()
 * - Pattern copied from claimEarnings.ts for consistency
 * 
 * IMPORTANT:
 * - USDC has 6 decimals (not 18 like ETH)
 * - Uses getUSDCAddress() from config/addresses.ts
 * - Refreshes user data after successful withdrawal
 * 
 * CREATED: Jan 2026 - Replaced old Payments page
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { ethers } from "ethers";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import Modal from "@/components/Modal/Modal";
import { useTransfersModal } from "@/context/TransfersModalContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useSignerContext } from "@/context/SignerContext";
import { useUserData } from "@/context/UserDataContext";
import { getUSDCAddress } from "@/config/addresses";
import "./TransfersModal.scss";

type ModalView = "withdraw" | "review" | "submitted";

// Address validation regex
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Base mainnet chain id
const BASE_CHAIN_ID = 8453;

// USDC contract ABI
const USDC_ABI = ["function transfer(address to, uint256 amount) returns (bool)"];

export function TransfersModal() {
	const { isOpen, closeModal } = useTransfersModal();
	const { cashBalance } = usePortfolio();
	const { account, hasSmartWallet, signer } = useSignerContext();
	const { refresh: refreshUserData } = useUserData();
	const { getClientForChain } = useSmartWallets();

	// View state - starts on withdraw form
	const [view, setView] = useState<ModalView>("withdraw");

	// Withdraw form state
	const [recipientAddress, setRecipientAddress] = useState("");
	const [withdrawAmount, setWithdrawAmount] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [txHash, setTxHash] = useState<string | null>(null);

	// Interface for encoding function calls
	const iface = useMemo(() => new ethers.Interface(USDC_ABI), []);

	// Reset state when modal closes
	useEffect(() => {
		if (!isOpen) {
			// Delay reset to allow close animation
			const timer = setTimeout(() => {
				setView("withdraw");
				setRecipientAddress("");
				setWithdrawAmount("");
				setError(null);
				setIsSubmitting(false);
				setTxHash(null);
			}, 200);
			return () => clearTimeout(timer);
		}
	}, [isOpen]);

	// Format currency helper
	const formatCurrency = useCallback((value: number | null | string): string => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		if (num === null || !isFinite(num)) return "0.00";
		return new Intl.NumberFormat("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(num);
	}, []);

	// Validation states
	const addressHasInput = recipientAddress.length > 0;
	const isAddressValid = ADDRESS_REGEX.test(recipientAddress);
	const isAddressInvalid = addressHasInput && !isAddressValid;

	const amountHasInput = withdrawAmount.length > 0;
	const parsedAmount = parseFloat(withdrawAmount);
	const isAmountOverBalance = amountHasInput && !isNaN(parsedAmount) && parsedAmount > cashBalance;
	const isAmountValid = amountHasInput && !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= cashBalance;

	const canProceedToReview = isAddressValid && isAmountValid;

	// Handle proceed to review screen
	const handleProceedToReview = useCallback(() => {
		if (!canProceedToReview) return;
		setError(null);
		setView("review");
	}, [canProceedToReview]);

	// Handle back to form
	const handleBackToForm = useCallback(() => {
		setError(null);
		setView("withdraw");
	}, []);

	// Handle actual send transaction
	const handleSendTransaction = useCallback(async () => {
		if (!account) {
			setError("No wallet connected");
			return;
		}

		setIsSubmitting(true);
		setError(null);
		setTxHash(null);

		try {
			// Convert amount to USDC units (6 decimals)
			const amountWei = ethers.parseUnits(withdrawAmount, 6);

			// Encode the transfer function call
			const transferData = iface.encodeFunctionData("transfer", [
				recipientAddress,
				amountWei,
			]);

			console.log("TRANSFER DEBUG:", {
				to: getUSDCAddress(),
				recipient: recipientAddress,
				amount: withdrawAmount,
				amountWei: amountWei.toString(),
				hasSmartWallet,
				account,
			});

			let resultTxHash: string;

			if (hasSmartWallet) {
				// Smart wallet path - use viem client
				console.log("TRANSFER: Using smart wallet path");
				const smartWalletClient = await getClientForChain({
					id: BASE_CHAIN_ID,
				});
				if (!smartWalletClient) {
					throw new Error("No smart wallet client available for Base chain");
				}

				const tx = await smartWalletClient.sendTransaction({
					to: getUSDCAddress() as `0x${string}`,
					data: transferData as `0x${string}`,
					value: 0n,
				});
				resultTxHash = tx;
			} else {
				// External/Embedded wallet path - use ethers signer
				console.log("TRANSFER: Using external/embedded wallet path");
				if (!signer) {
					throw new Error("No signer available");
				}

				const tx = await signer.sendTransaction({
					to: getUSDCAddress(),
					data: transferData,
					value: 0,
				});
				await tx.wait();
				resultTxHash = tx.hash;
			}

			console.log("TRANSFER SUCCESS: Transaction hash:", resultTxHash);
			setTxHash(resultTxHash);

			// Show submitted confirmation
			setView("submitted");

			// Refresh balance
			refreshUserData();
		} catch (err: any) {
			console.error("Withdrawal error:", err);
			setError(err?.message || "Something went wrong. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}, [account, hasSmartWallet, signer, getClientForChain, recipientAddress, withdrawAmount, iface, refreshUserData]);

	// Handle done - close modal
	const handleDone = useCallback(() => {
		closeModal();
	}, [closeModal]);

	// Handle cancel - close modal
	const handleCancel = useCallback(() => {
		closeModal();
	}, [closeModal]);

	// Get modal title based on view
	const getModalTitle = (): string => {
		switch (view) {
			case "review":
				return "Review Withdrawal";
			case "submitted":
				return "Withdrawal Submitted";
			default:
				return "Withdraw USDC";
		}
	};

	// Get input class names based on validation state
	const getAddressInputClass = () => {
		let classes = "transfers-address-input";
		if (isAddressValid) classes += " input-valid";
		if (isAddressInvalid) classes += " input-error";
		return classes;
	};

	const getAmountInputClass = () => {
		let classes = "";
		if (isAmountOverBalance) classes += " input-error";
		return classes;
	};

	// Render withdraw form view
	const renderWithdrawView = () => (
		<div className="transfers-withdraw-form">
			<div className="transfers-input-group">
				<label>Recipient Address</label>
				<input
					type="text"
					className={getAddressInputClass()}
					placeholder="0x..."
					value={recipientAddress}
					onChange={(e) => setRecipientAddress(e.target.value)}
				/>
				{isAddressInvalid && (
					<div className="transfers-field-error">Invalid address</div>
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
					Available: <span>${formatCurrency(cashBalance)}</span>
				</div>
				{isAmountOverBalance && (
					<div className="transfers-field-error">Insufficient balance</div>
				)}
			</div>

			<div className="transfers-network-notice">
				Only send to an address that supports USDC on Base. If the recipient cannot accept USDC on Base, funds may be lost permanently.
			</div>

			<div className="transfers-form-actions">
				<button
					className="transfers-btn-confirm"
					onClick={handleProceedToReview}
					disabled={!canProceedToReview}
				>
					Confirm Send
				</button>
				<button
					className="transfers-btn-cancel"
					onClick={handleCancel}
				>
					Cancel
				</button>
			</div>
		</div>
	);

	// Render review view - shows all details before sending
	const renderReviewView = () => (
		<div className="transfers-review">
			{error && (
				<div className="transfers-error-message">
					<span className="transfers-error-text">{error}</span>
				</div>
			)}

			<p className="transfers-review-warning">
				Please review the details below. This transaction cannot be reversed.
			</p>

			<div className="transfers-review-details">
				<div className="transfers-review-row">
					<span className="transfers-review-label">Network</span>
					<span className="transfers-review-value">USDC on Base</span>
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
					className="transfers-btn-send"
					onClick={handleSendTransaction}
					disabled={isSubmitting}
				>
					{isSubmitting ? (
						<span className="transfers-btn-loading">
							<span className="transfers-spinner" />
							Sending...
						</span>
					) : (
						"Send"
					)}
				</button>
				<button
					className="transfers-btn-cancel"
					onClick={handleBackToForm}
					disabled={isSubmitting}
				>
					Back
				</button>
			</div>
		</div>
	);

	// Render submitted confirmation view
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
					<span className="transfers-confirmation-label">Network</span>
					<span className="transfers-confirmation-value">USDC on Base</span>
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
				{txHash && (
					<div className="transfers-confirmation-row">
						<span className="transfers-confirmation-label">Transaction</span>
						<a 
							className="transfers-confirmation-value tx-link"
							href={`https://basescan.org/tx/${txHash}`}
							target="_blank"
							rel="noopener noreferrer"
						>
							View on BaseScan
						</a>
					</div>
				)}
			</div>

			<button className="transfers-btn-done" onClick={handleDone}>
				Done
			</button>
		</div>
	);

	// Render content based on view
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
