import { useMemo } from "react";
import {
	useSetupActivation,
	type SetupVenueId,
} from "./SetupActivationContext";

/**
 * Read-only observer over `SetupActivationContext` that the modal's
 * checklist consumes. Owning the derivation here keeps the checklist + the
 * gate code (which decides when to advance from `venues` to `kalshi`) in
 * lockstep — there's exactly one definition of "all venues ready".
 *
 * Note: the gate (`FirstSignupSetupGate`) is the SINGLE owner of
 * `onboardingActive` flips. This hook is purely an observer; it does not
 * mutate context.
 */
export type VenueSetupRow = {
	id: SetupVenueId;
	label: string;
	state: "pending" | "in_progress" | "ready";
};

const ROW_LABELS: Record<SetupVenueId, string> = {
	polymarket: "Setting up Polymarket account",
	predict: "Setting up Predict account",
	limitless: "Setting up Limitless account",
};

// Visible activation order: Predict -> Limitless -> Polymarket. The
// gates in `PredictBackgroundActivation`, `LimitlessBackgroundActivation`,
// and `PolymarketBackgroundActivation` chain in this order, and a 4th
// silent activator (`PolymarketDepositDeployBackgroundActivation`)
// pre-warms the Polymarket deposit-wallet deploy at boot in parallel
// with Predict so the visible Polymarket row no longer waits on it.
const ROW_ORDER: readonly SetupVenueId[] = [
	"predict",
	"limitless",
	"polymarket",
];

export type FirstSignupSetupSnapshot = {
	rows: VenueSetupRow[];
	allReady: boolean;
	anyInProgress: boolean;
};

export function useFirstSignupSetup(): FirstSignupSetupSnapshot {
	const { venues } = useSetupActivation();

	return useMemo<FirstSignupSetupSnapshot>(() => {
		const rows: VenueSetupRow[] = ROW_ORDER.map((id) => {
			const snap = venues[id];
			let state: VenueSetupRow["state"];
			if (snap.ready) state = "ready";
			else if (snap.setupInProgress) state = "in_progress";
			else state = "pending";
			return { id, label: ROW_LABELS[id], state };
		});
		const allReady = rows.every((r) => r.state === "ready");
		const anyInProgress = rows.some((r) => r.state === "in_progress");
		return { rows, allReady, anyInProgress };
	}, [venues]);
}
