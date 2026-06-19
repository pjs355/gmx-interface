import React from "react";
import { useQuickFiatDeposit } from "./useQuickFiatDeposit";

type BuyWithCardFn = () => Promise<void>;

type DepositFundingTriggerProps = {
	ready?: boolean;
	onComplete?: () => void;
	children: (p: { buyWithCard: BuyWithCardFn; canBuyWithCard: boolean }) => React.ReactNode;
};

/** Quick fiat onramp (Base USDC only) — for header, banner, etc. Does not mount useDepositAddress. */
export function DepositFundingTrigger({
	ready = true,
	onComplete,
	children,
}: DepositFundingTriggerProps) {
	const funding = useQuickFiatDeposit(onComplete);
	return (
		<>
			{children({
				buyWithCard: funding.buyWithCard,
				canBuyWithCard: ready && funding.canBuyWithCard,
			})}
		</>
	);
}

type DepositFundingButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	ready?: boolean;
	onComplete?: () => void;
};

export function DepositFundingButton({
	ready = true,
	onComplete,
	children,
	className,
	...rest
}: DepositFundingButtonProps) {
	const funding = useQuickFiatDeposit(onComplete);
	return (
		<button
			type="button"
			{...rest}
			className={className}
			disabled={rest.disabled ?? !(ready && funding.canBuyWithCard)}
			onClick={() => void funding.buyWithCard()}
		>
			{children}
		</button>
	);
}
