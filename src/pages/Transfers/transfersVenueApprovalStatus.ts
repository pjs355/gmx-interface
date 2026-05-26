import type { SorVenue } from "@/features/trading/sor/core/sor-types";

export type TransfersVenueApprovalBadge =
	| { status: "loading" }
	| { status: "ready"; label: string }
	| { status: "needs_setup"; label: string };

export function badgeFromBooleanReady(
	ready: boolean | null | undefined,
	isLoading: boolean,
	opts?: { readyLabel?: string; needsLabel?: string },
): TransfersVenueApprovalBadge {
	if (isLoading || ready === null || ready === undefined) {
		return { status: "loading" };
	}
	if (ready) {
		return {
			status: "ready",
			label: opts?.readyLabel ?? "Approved",
		};
	}
	return {
		status: "needs_setup",
		label: opts?.needsLabel ?? "Needs approval",
	};
}

export type TransfersVenueApprovalMap = Record<SorVenue, TransfersVenueApprovalBadge>;
