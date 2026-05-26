/**
 * TransfersModalContext
 *
 * PURPOSE:
 * Controls the visibility of the Withdraw USDC modal (TransfersModal component).
 * This modal handles USDC withdrawals from the user's wallet to any external address.
 *
 * ARCHITECTURE:
 * - The old "Payments" page was replaced with a simplified "Transfers" system (Jan 2026)
 * - Deposits: Handled by Privy's native fundWallet() - no custom modal needed
 * - Withdrawals: Handled by TransfersModal component, controlled by this context
 *
 * USAGE:
 * - Call openModal() to show the withdraw modal (e.g., from Transfers page "Withdraw" button)
 * - Call closeModal() to hide it (or user clicks Cancel/Done)
 *
 * WHERE IT'S USED:
 * - Transfers page (/transfers) - "Withdraw Funds" button
 * - TransfersModal component - listens to isOpen state
 *
 * NOTE: Deposits do NOT use this modal. They use Privy's useFundWallet() hook directly.
 * See: Transfers.tsx, AppHeaderUser.tsx, PositionsHeader.tsx for deposit handling.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

type TransfersModalContextValue = {
	isOpen: boolean;
	openModal: () => void;
	closeModal: () => void;
};

const TransfersModalContext = createContext<TransfersModalContextValue | null>(null);

export function TransfersModalProvider({ children }: { children: React.ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);

	const openModal = useCallback(() => {
		setIsOpen(true);
	}, []);

	const closeModal = useCallback(() => {
		setIsOpen(false);
	}, []);

	const value = useMemo<TransfersModalContextValue>(
		() => ({
			isOpen,
			openModal,
			closeModal,
		}),
		[isOpen, openModal, closeModal],
	);

	return <TransfersModalContext.Provider value={value}>{children}</TransfersModalContext.Provider>;
}

export function useTransfersModal(): TransfersModalContextValue {
	const ctx = useContext(TransfersModalContext);
	if (!ctx) {
		throw new Error("useTransfersModal must be used within a TransfersModalProvider");
	}
	return ctx;
}
