import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";

/**
 * Three venues bootstrap silently in the background after sign-in:
 * Polymarket (Polygon Safe + approvals), Predict (BSC EOA + TEE-sponsored
 * approvals), Limitless (Base smart wallet + approvals). Each venue's
 * activator hook publishes its `setupInProgress` here so two unrelated
 * surfaces can react to it without prop-drilling:
 *
 *   1. The first-signup setup modal: it observes the per-venue flags to
 *      paint the checklist and decide when the "Enable Kalshi" step is
 *      reachable.
 *   2. The trade box: when `anyInProgress` is true, it suppresses the
 *      `EXECUTION_NOT_READY` error block and the "Trading setup required" /
 *      venue-specific loading copy so users never see jarring midstream
 *      messages while the gate is still doing its job.
 *
 * `onboardingActive` is a separate signal owned by the modal/gate. When it
 * is true, the activator components rush past their `requestIdleCallback`
 * delay and start executing immediately so the modal isn't waiting on
 * idle-time slack for the first 5 seconds of the user's session.
 */
export type SetupVenueId = "polymarket" | "predict" | "limitless";

export type VenueSetupSnapshot = {
	setupInProgress: boolean;
	ready: boolean;
};

type SetupActivationContextValue = {
	onboardingActive: boolean;
	setOnboardingActive(active: boolean): void;
	venues: Record<SetupVenueId, VenueSetupSnapshot>;
	reportVenueSnapshot(venue: SetupVenueId, snap: VenueSetupSnapshot): void;
	anyInProgress: boolean;
	allReady: boolean;
};

const DEFAULT_SNAPSHOT: VenueSetupSnapshot = {
	setupInProgress: false,
	ready: false,
};

const SetupActivationContext = createContext<SetupActivationContextValue | null>(
	null,
);

export function SetupActivationProvider({ children }: { children: ReactNode }) {
	const [onboardingActive, setOnboardingActive] = useState(false);
	const [venues, setVenues] = useState<
		Record<SetupVenueId, VenueSetupSnapshot>
	>({
		polymarket: DEFAULT_SNAPSHOT,
		predict: DEFAULT_SNAPSHOT,
		limitless: DEFAULT_SNAPSHOT,
	});

	const lastSnapshotRef = useRef<Record<SetupVenueId, string>>({
		polymarket: "",
		predict: "",
		limitless: "",
	});

	const reportVenueSnapshot = useCallback(
		(venue: SetupVenueId, snap: VenueSetupSnapshot) => {
			const key = `${snap.setupInProgress ? 1 : 0}|${snap.ready ? 1 : 0}`;
			if (lastSnapshotRef.current[venue] === key) return;
			lastSnapshotRef.current[venue] = key;
			setVenues((prev) => ({ ...prev, [venue]: snap }));
		},
		[],
	);

	const value = useMemo<SetupActivationContextValue>(() => {
		const venueList = Object.values(venues);
		return {
			onboardingActive,
			setOnboardingActive,
			venues,
			reportVenueSnapshot,
			anyInProgress: venueList.some((v) => v.setupInProgress),
			allReady: venueList.every((v) => v.ready),
		};
	}, [onboardingActive, venues, reportVenueSnapshot]);

	return (
		<SetupActivationContext.Provider value={value}>
			{children}
		</SetupActivationContext.Provider>
	);
}

/** Throws if used outside the provider — fail loud, this is mandatory wiring. */
export function useSetupActivation(): SetupActivationContextValue {
	const ctx = useContext(SetupActivationContext);
	if (!ctx) {
		throw new Error(
			"useSetupActivation must be used within <SetupActivationProvider>",
		);
	}
	return ctx;
}

/**
 * Soft variant: returns null if the provider is missing. Used by deeply
 * nested components (trade box, button state hook) that can render before
 * the provider mounts in tests or storybook. The default behavior when no
 * provider is mounted is "no setup in progress" — i.e. exactly today's
 * behavior, which is the correct fallback.
 */
export function useSetupActivationOptional(): SetupActivationContextValue | null {
	return useContext(SetupActivationContext);
}
