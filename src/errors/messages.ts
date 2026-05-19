import type { ErrorDef } from "./types";

/** User-facing copy for a catalog entry. */
export function userMessage(def: ErrorDef): string {
	return def.userMessage;
}

export function formatPolymarketApprovalRepairFailed(detail: string): string {
	const trimmed = detail.trim();
	if (trimmed.length === 0) {
		return "Polymarket order failed; approval repair also failed.";
	}
	return `Polymarket order failed; approval repair also failed: ${trimmed}`;
}

export function formatSorNoOrderBookForVenue(venueDisplayName: string): string {
	return `No order book for ${venueDisplayName} on this market yet. Try another tab or All Markets.`;
}

export function formatUnknownSorVenue(venue: string): string {
	return `Unknown venue: ${venue}`;
}

export function formatPolymarketOrderRejected(
	context: string,
	status: number | undefined,
): string {
	const verb = context.includes("limit") ? "limit order" : "market order";
	if (status != null) {
		return `Polymarket rejected the ${verb} (HTTP ${status}). Try again.`;
	}
	return `Polymarket rejected the ${verb}. Try again.`;
}

export function formatAdminImageUploadFailed(imageType: string): string {
	return `Image upload failed (${imageType}).`;
}

export function formatLifiWithdrawStepFailed(step: number, total: number): string {
	return `Withdraw step ${step} of ${total} failed. Try again.`;
}
