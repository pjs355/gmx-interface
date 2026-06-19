import React, { useLayoutEffect } from "react";
import { useQuickFiatDeposit } from "./useQuickFiatDeposit";

type BuyWithCardFn = () => Promise<void>;

function SyncBuyWithCardToRef({
	canBuyWithCard,
	buyWithCard,
	depositActionRef,
}: {
	canBuyWithCard: boolean;
	buyWithCard: BuyWithCardFn;
	depositActionRef: React.MutableRefObject<BuyWithCardFn | null>;
}) {
	useLayoutEffect(() => {
		if (canBuyWithCard) {
			depositActionRef.current = buyWithCard;
		} else {
			depositActionRef.current = null;
		}
		return () => {
			depositActionRef.current = null;
		};
	}, [canBuyWithCard, buyWithCard, depositActionRef]);
	return null;
}

/**
 * Keeps a ref in sync with `buyWithCard` from `useQuickFiatDeposit` so call sites
 * (trade box, onboarding) can trigger deposits without mounting the hook in the parent.
 */
export function RegisterDepositAction({
	ready = true,
	onComplete,
	depositActionRef,
}: {
	ready?: boolean;
	onComplete?: () => void;
	depositActionRef: React.MutableRefObject<BuyWithCardFn | null>;
}) {
	const funding = useQuickFiatDeposit(onComplete);
	return (
		<SyncBuyWithCardToRef
			canBuyWithCard={ready && funding.canBuyWithCard}
			buyWithCard={funding.buyWithCard}
			depositActionRef={depositActionRef}
		/>
	);
}
