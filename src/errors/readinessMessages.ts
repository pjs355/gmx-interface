import type { SorVenue, VenueRequirements } from "@/trading/sor/core/sor-types";
import {
	READINESS_BLOCKED_FALLBACK,
	READINESS_BLOCKING_MESSAGES,
} from "./catalog/readiness";
import { userMessage } from "./messages";

export function blockingReasonToMessage(code: string | undefined | null): string {
	if (!code?.trim()) {
		return userMessage(READINESS_BLOCKED_FALLBACK);
	}
	const key = code.trim();
	const mapped = READINESS_BLOCKING_MESSAGES[key];
	if (mapped) return mapped;
	if (import.meta.env.DEV) {
		return `${userMessage(READINESS_BLOCKED_FALLBACK)} (${key})`;
	}
	return userMessage(READINESS_BLOCKED_FALLBACK);
}

export function blockingReasonsToMessages(codes: string[] | undefined): string[] {
	if (!codes?.length) return [];
	return [...new Set(codes.map(blockingReasonToMessage))];
}

/** Collect unique server readiness codes from SOR `venueRequirements`. */
export function collectBlockingReasonsFromVenueRequirements(
	venueRequirements: Partial<Record<SorVenue, VenueRequirements>> | undefined,
	opts?: { venues?: SorVenue[]; onlyNotReady?: boolean },
): string[] {
	if (!venueRequirements) return [];
	const onlyNotReady = opts?.onlyNotReady !== false;
	const venueFilter = opts?.venues?.length ? new Set(opts.venues) : null;
	const out: string[] = [];
	const seen = new Set<string>();

	for (const [venue, req] of Object.entries(venueRequirements) as Array<
		[SorVenue, VenueRequirements]
	>) {
		if (venueFilter && !venueFilter.has(venue)) continue;
		if (onlyNotReady && req.executionReady !== false) continue;
		for (const code of req.blockingReasons ?? []) {
			if (!code?.trim() || seen.has(code)) continue;
			seen.add(code);
			out.push(code);
		}
	}
	return out;
}

/**
 * Prefer mapped blocking-reason copy; fall back to SOR server error prose
 * (already user-facing for EXECUTION_NOT_READY).
 */
export function formatExecutionNotReadyUserMessage(opts: {
	serverError?: string | null;
	venueRequirements?: Partial<Record<SorVenue, VenueRequirements>>;
	targetVenue?: SorVenue;
}): string {
	const codes = collectBlockingReasonsFromVenueRequirements(
		opts.venueRequirements,
		opts.targetVenue ? { venues: [opts.targetVenue] } : undefined,
	);
	const mapped = blockingReasonsToMessages(codes);
	if (mapped.length > 0) {
		return mapped.join(" ");
	}
	const err = opts.serverError?.trim();
	if (err) return err;
	return userMessage(READINESS_BLOCKED_FALLBACK);
}

/** Short CTA label for the trade button when setup is required. */
export function executionNotReadyButtonLabel(opts: {
	serverError?: string | null;
	venueRequirements?: Partial<Record<SorVenue, VenueRequirements>>;
	targetVenue?: SorVenue;
}): string {
	const full = formatExecutionNotReadyUserMessage(opts);
	if (full.length <= 56) return full;
	return `${full.slice(0, 53).trimEnd()}…`;
}
