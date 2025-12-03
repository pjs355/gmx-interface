/**
 * Payments Module - Main Export
 * 
 * Clean architecture for payment features:
 * 
 * /Payments
 * ├── index.ts          # Module entry point
 * ├── Payments.tsx      # Main page component
 * ├── Payments.scss     # Styles
 * ├── types.ts          # Type definitions
 * ├── constants.ts      # Configuration & constants
 * ├── hooks/
 * │   ├── index.ts      # Hook exports
 * │   └── usePayments.ts # Business logic hook
 * └── components/
 *     ├── index.ts      # Component exports
 *     ├── BalanceCard.tsx
 *     ├── MessageDisplay.tsx
 *     ├── PaymentTabs.tsx
 *     ├── AuthRequired.tsx
 *     ├── PaymentsFooter.tsx
 *     ├── shared/       # Reusable components
 *     │   ├── AmountInput.tsx
 *     │   ├── QuickAmounts.tsx
 *     │   ├── PrimaryButton.tsx
 *     │   ├── BalanceDisplay.tsx
 *     │   └── Notice.tsx
 *     └── tabs/         # Tab-specific components
 *         ├── DepositTab.tsx
 *         ├── WithdrawTab.tsx
 *         ├── SendTab.tsx
 *         └── HistoryTab.tsx
 */

export { default } from "./Payments";

// Re-export types for external use
export type * from "./types";

// Re-export constants for external use
export * from "./constants";

