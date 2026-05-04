import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { tradingQueryKeys } from "@/trading/queryKeys";
import { FirstSignupSetupModal } from "./FirstSignupSetupModal";
import {
	useOnboardingStep,
	type OnboardingStep,
} from "./useOnboardingStep";
import { useSetupActivation } from "./SetupActivationContext";

/**
 * Decides whether to render the post-signup setup modal.
 *
 * Show iff ALL of:
 *  - Privy is `ready` and `authenticated`
 *  - Profile query has resolved at least once (we have a definitive answer
 *    about `onboardingCompletedAt`)
 *  - `onboardingCompletedAt` is missing on the profile
 *
 * The flag is the canonical signal:
 *  - For brand-new users it's set after they click through the modal.
 *  - For users that pre-existed the modal, the one-time migration script
 *    (`scripts/backfill-onboarding-completed-at.ts`) already stamped the
 *    flag — so the modal NEVER fires retroactively for established users.
 *  - On hard refresh during the flow, the flag is still missing, so we
 *    re-mount the modal at the persisted step (from `localStorage`).
 *
 * `onboardingCompletedAt` is committed via
 * `postOnboardingComplete()` BEFORE we transition to the deposit step — that
 * way Privy's `fundWallet` modal can be dismissed without leaving the user
 * stuck mid-onboarding next session.
 */
export function FirstSignupSetupGate() {
	const { authenticated, ready: privyReady, user } = usePrivy();
	const profileQuery = useCurrentProfile({ enabled: authenticated });
	const api = usePrivateApiClient();
	const qc = useQueryClient();
	const location = useLocation();
	const { setOnboardingActive } = useSetupActivation();

	const userId = user?.id ?? null;

	const onboardingCompletedAt = profileQuery.data?.onboardingCompletedAt ?? null;

	// We only consider a user "definitely incomplete" once the profile query
	// has actually resolved at least once. Until then, we want a clean blank
	// screen — never flash the modal for an existing user mid-fetch.
	const profileResolved = profileQuery.isSuccess || profileQuery.isError;

	const shouldGate =
		privyReady &&
		authenticated &&
		Boolean(userId) &&
		profileResolved &&
		!onboardingCompletedAt;

	const { step, advanceTo } = useOnboardingStep({
		userId,
		enabled: shouldGate,
	});

	useEffect(() => {
		setOnboardingActive(shouldGate && step !== "done");
	}, [shouldGate, step, setOnboardingActive]);

	// Atomic server commit. Fired exactly once when we're about to leave
	// `kalshi` for `deposit` — by then all background activations have
	// finished and the user has either kicked off Proof or chosen "Later".
	const committedRef = useRef(false);
	const commitOnboardingComplete = async (): Promise<void> => {
		if (committedRef.current) return;
		committedRef.current = true;
		try {
			await api.postOnboardingComplete();
		} catch (err) {
			// Server reachable but failed — log and let the user proceed.
			// Worst case the modal reopens next session; the gate will simply
			// retry the POST.
			console.error("[Onboarding] postOnboardingComplete failed:", err);
			committedRef.current = false;
		}
		// Refresh the profile query so other consumers see the new flag.
		await qc.invalidateQueries({ queryKey: tradingQueryKeys.profileMe });
	};

	const handleAdvance = async (next: OnboardingStep) => {
		if (next === "deposit") {
			await commitOnboardingComplete();
		}
		advanceTo(next);
	};

	const returnPath = useMemo(() => {
		// Re-entry path after the DFlow Proof redirect.
		const search = "?dflow_proof=1";
		const path = location.pathname || "/";
		return `${path}${search}`;
	}, [location.pathname]);

	if (!shouldGate) return null;
	if (step === "done") return null;

	return (
		<FirstSignupSetupModal
			step={step}
			onAdvance={(next) => void handleAdvance(next)}
			returnPath={returnPath}
		/>
	);
}
