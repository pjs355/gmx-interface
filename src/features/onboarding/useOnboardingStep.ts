import { useCallback, useEffect, useState } from "react";

/**
 * Single-step state machine for the post-signup setup modal.
 *
 *   "venues"  → blocking checklist while Polymarket / Predict / Limitless
 *               background activations finish.
 *   "kalshi"  → "Enable Kalshi trading" prompt (primary) + "Later"
 *               (secondary). User can skip this.
 *   "deposit" → Privy fundWallet modal opens automatically. The setup modal
 *               itself stays mounted with a brief "Add funds" message — we
 *               can't close it before fundWallet because Privy's modal needs
 *               us to keep the parent action alive.
 *   "done"    → Modal unmounts.
 *
 * State is persisted to `localStorage` under a single namespaced key so:
 *  - The DFlow KYC redirect (`window.location.href`) lands the user back at
 *    `?dflow_proof=1` and we can resume on `kalshi` → `deposit`.
 *  - A hard refresh during `venues` reopens the modal at `venues` (the
 *    activators will pick up where they left off — they're idempotent).
 *
 * We deliberately key by Privy `userId` so logging into a different account
 * doesn't pick up another user's mid-flight state.
 */
export type OnboardingStep = "venues" | "kalshi" | "deposit" | "done";

const STORAGE_KEY_PREFIX = "lu:onboarding:v1:";

function isOnboardingStep(v: unknown): v is OnboardingStep {
	return v === "venues" || v === "kalshi" || v === "deposit" || v === "done";
}

function readPersistedStep(userId: string | null): OnboardingStep | null {
	if (!userId) return null;
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + userId);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (
			parsed &&
			typeof parsed === "object" &&
			"step" in parsed &&
			isOnboardingStep((parsed as { step: unknown }).step)
		) {
			return (parsed as { step: OnboardingStep }).step;
		}
	} catch {
		/* storage unavailable / parse failure — start fresh */
	}
	return null;
}

function writePersistedStep(userId: string | null, step: OnboardingStep): void {
	if (!userId) return;
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			STORAGE_KEY_PREFIX + userId,
			JSON.stringify({ step, ts: Date.now() }),
		);
	} catch {
		/* storage quota / private mode — best-effort only */
	}
}

function clearPersistedStep(userId: string | null): void {
	if (!userId) return;
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(STORAGE_KEY_PREFIX + userId);
	} catch {
		/* ignore */
	}
}

export type UseOnboardingStepResult = {
	step: OnboardingStep;
	advanceTo(next: OnboardingStep): void;
	reset(): void;
};

/**
 * Reads `?dflow_proof=1` once on mount and bumps the step to `deposit` if
 * we're returning from a successful KYC redirect. Otherwise hydrates from
 * `localStorage` (or starts at `venues` for a fresh user).
 */
export function useOnboardingStep(args: {
	userId: string | null;
	enabled: boolean;
}): UseOnboardingStepResult {
	const { userId, enabled } = args;
	const [step, setStep] = useState<OnboardingStep>(() => {
		if (!enabled || !userId) return "venues";
		return readPersistedStep(userId) ?? "venues";
	});

	useEffect(() => {
		if (!enabled || !userId) return;
		const persisted = readPersistedStep(userId);
		if (persisted && persisted !== step) setStep(persisted);
	}, [enabled, userId]);

	useEffect(() => {
		if (!enabled || !userId) return;
		// Successful DFlow KYC return — skip kalshi prompt and go straight to
		// deposit. We strip the param so a later refresh doesn't loop us back.
		if (typeof window === "undefined") return;
		const url = new URL(window.location.href);
		const flag = url.searchParams.get("dflow_proof");
		if (flag === "1") {
			url.searchParams.delete("dflow_proof");
			window.history.replaceState(null, "", url.pathname + url.search + url.hash);
			setStep("deposit");
			writePersistedStep(userId, "deposit");
		}
	}, [enabled, userId]);

	const advanceTo = useCallback(
		(next: OnboardingStep) => {
			setStep(next);
			if (next === "done") {
				clearPersistedStep(userId);
			} else {
				writePersistedStep(userId, next);
			}
		},
		[userId],
	);

	const reset = useCallback(() => {
		setStep("venues");
		clearPersistedStep(userId);
	}, [userId]);

	return { step, advanceTo, reset };
}
