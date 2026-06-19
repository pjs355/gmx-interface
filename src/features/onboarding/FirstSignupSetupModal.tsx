import { useEffect, useRef } from "react";
import { RemoveScroll } from "react-remove-scroll";
import { RegisterDepositAction } from "@/features/funding/RegisterDepositAction";
import { SetupChecklist } from "./SetupChecklist";
import { KalshiEnableStep } from "./KalshiEnableStep";
import { useFirstSignupSetup } from "./useFirstSignupSetup";
import { useDepositAfterSetup } from "./useDepositAfterSetup";
import type { OnboardingStep } from "./useOnboardingStep";

import "./FirstSignupSetupModal.scss";

/**
 * Blocking, non-dismissible setup modal shown to brand-new users immediately
 * after Privy hands control back to the app.
 */
export function FirstSignupSetupModal(props: {
	step: OnboardingStep;
	onAdvance(next: OnboardingStep): void;
	returnPath: string;
}) {
	const { step, onAdvance, returnPath } = props;
	const setup = useFirstSignupSetup();
	const { depositActionRef, triggerDeposit, depositReady } = useDepositAfterSetup();

	const firedRef = useRef(false);
	useEffect(() => {
		if (step !== "deposit") firedRef.current = false;
	}, [step]);

	useEffect(() => {
		if (step !== "deposit") return;
		if (firedRef.current) return;

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const tryFire = async () => {
			if (cancelled) return false;
			if (!depositReady) return false;
			const ok = await triggerDeposit();
			if (ok) firedRef.current = true;
			return ok;
		};

		let attempts = 0;
		const tick = async () => {
			attempts += 1;
			const fired = await tryFire();
			if (fired) {
				timer = setTimeout(() => {
					if (!cancelled) onAdvance("done");
				}, 250);
				return;
			}
			if (attempts >= 5) {
				onAdvance("done");
				return;
			}
			timer = setTimeout(() => void tick(), 800);
		};
		void tick();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [step, depositReady, triggerDeposit, onAdvance]);

	return (
		<RemoveScroll>
			<div
				className="first-signup-setup-modal"
				role="dialog"
				aria-modal="true"
				aria-label="Setting up your account"
			>
				<div className="first-signup-setup-modal__card" data-qa="first-signup-setup-modal">
					{step === "venues" && (
						<>
							<h3 className="first-signup-setup-modal__heading">Setting up your accounts</h3>
							<p className="first-signup-setup-modal__sub">
								We are getting everything ready so you can trade across all markets. This may take a
								few minutes.
							</p>
							<SetupChecklist rows={setup.rows} />
							<div className="first-signup-setup-modal__actions">
								<button
									type="button"
									className="first-signup-setup-modal__btn first-signup-setup-modal__btn--primary"
									onClick={() => onAdvance("kalshi")}
									disabled={!setup.allReady}
									data-qa="onboarding-venues-continue"
								>
									{setup.allReady ? "Continue" : "Setting up…"}
								</button>
							</div>
						</>
					)}

					{step === "kalshi" && (
						<KalshiEnableStep
							onLater={() => onAdvance("deposit")}
							onAlreadyVerified={() => onAdvance("deposit")}
							returnPath={returnPath}
						/>
					)}

					{step === "deposit" && (
						<>
							<h3 className="first-signup-setup-modal__heading">Add funds</h3>
							<p className="first-signup-setup-modal__sub">
								Drop in some USDC to start trading. You can always come back here from the header.
							</p>
							<div className="first-signup-setup-modal__deposit-msg">Opening deposit…</div>
						</>
					)}

					<RegisterDepositAction ready={true} depositActionRef={depositActionRef} />
				</div>
			</div>
		</RemoveScroll>
	);
}
