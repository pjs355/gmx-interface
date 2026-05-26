import { useEffect, useRef } from "react";
import { RemoveScroll } from "react-remove-scroll";
import { RegisterPrivyOpenFundAction } from "@/components/PrivyGatedFundWallet/PrivyGatedFundWallet";
import { SetupChecklist } from "./SetupChecklist";
import { KalshiEnableStep } from "./KalshiEnableStep";
import { useFirstSignupSetup } from "./useFirstSignupSetup";
import { useFundWalletAfterSetup } from "./useFundWalletAfterSetup";
import type { OnboardingStep } from "./useOnboardingStep";

import "./FirstSignupSetupModal.scss";

/**
 * Blocking, non-dismissible setup modal shown to brand-new users immediately
 * after Privy hands control back to the app. Body of the modal is driven by
 * `step`:
 *
 *   "venues"  → checklist of three rows (Polymarket / Predict / Limitless),
 *               primary button enables once `allReady` flips true. The
 *               primary button advances to "kalshi". No "skip" button
 *               here — venues bootstrap silently and the activators retry
 *               on backoff if anything fails.
 *   "kalshi"  → DFlow Proof prompt with primary "Enable Kalshi trading"
 *               and secondary "Later". Either path leads to "deposit".
 *   "deposit" → Auto-fires Privy `fundWallet` once. Modal stays mounted
 *               showing a brief "Add funds" message; user can close the
 *               Privy modal or fund and we mark onboarding complete
 *               regardless (we set the flag BEFORE opening fundWallet —
 *               see `useFundWalletAfterSetup`).
 *
 * `step` is owned by the parent gate. The modal is purely presentational;
 * it requests transitions via `onAdvance`.
 */
export function FirstSignupSetupModal(props: {
	step: OnboardingStep;
	onAdvance(next: OnboardingStep): void;
	returnPath: string;
}) {
	const { step, onAdvance, returnPath } = props;
	const setup = useFirstSignupSetup();
	const { fundTarget, fundActionRef, triggerFund, fundReady } = useFundWalletAfterSetup();

	// Hard guard: `triggerFund` may NEVER fire more than once per visit to
	// the deposit step. Privy's `fundWallet` opens a modal that schedules
	// internal setState, which can ripple back into this tree and cause the
	// effect's deps to churn. Without this ref we'd loop ("Maximum update
	// depth exceeded"). Reset when leaving the deposit step so a future
	// re-entry (e.g. localStorage hydration) can fire again.
	const firedRef = useRef(false);
	useEffect(() => {
		if (step !== "deposit") firedRef.current = false;
	}, [step]);

	useEffect(() => {
		if (step !== "deposit") return;
		if (firedRef.current) return;
		// Privy's `fundWallet` is fire-and-forget — user can dismiss the
		// modal with no completion signal. The gate has already POSTed
		// `/profiles/me/onboarding/complete` before transitioning here, so
		// even if the user closes Privy, they're done. We trigger fundWallet
		// once, regardless of whether `fundTarget` resolves later (we wait a
		// brief moment for the EVM target to hydrate, then fire).
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const tryFire = async () => {
			if (cancelled) return false;
			if (!fundReady) {
				// fundTarget not yet resolved (account overview or polymarket
				// query still loading). Retry shortly. After 5 attempts at
				// 800ms, give up and just close the modal — we already marked
				// onboarding complete server-side.
				return false;
			}
			const ok = await triggerFund();
			if (ok) firedRef.current = true;
			return ok;
		};

		let attempts = 0;
		const tick = async () => {
			attempts += 1;
			const fired = await tryFire();
			if (fired) {
				// Modal will auto-close after fundWallet returns/dismisses.
				timer = setTimeout(() => {
					if (!cancelled) onAdvance("done");
				}, 250);
				return;
			}
			if (attempts >= 5) {
				// Couldn't resolve fund target — bail out cleanly, user can
				// always deposit later from the header.
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
	}, [step, fundReady, triggerFund, onAdvance]);

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

					{/* Mounts Privy's `useFundWallet` only when the EVM fund target is
					 * a valid address. Syncs the imperative `openFund()` callback to
					 * `fundActionRef` so the deposit-step effect can fire it once. */}
					<RegisterPrivyOpenFundAction
						fundTarget={fundTarget}
						ready={true}
						fundActionRef={fundActionRef}
					/>
				</div>
			</div>
		</RemoveScroll>
	);
}
