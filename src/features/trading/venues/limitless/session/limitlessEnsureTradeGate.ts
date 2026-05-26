/**
 * Coerces Limitless partner `ownerId` values from JSON (often number, sometimes string).
 */
export function coercePositivePartnerOwnerId(raw: unknown): number | null {
	if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
		return Math.trunc(raw);
	}
	if (typeof raw === "string") {
		const n = Number(raw.trim());
		if (Number.isFinite(n) && n > 0) return Math.trunc(n);
	}
	return null;
}

function unwrapLimitlessEnsureInner(o: Record<string, unknown>): Record<string, unknown> {
	return o.data != null && typeof o.data === "object" ? (o.data as Record<string, unknown>) : o;
}

/**
 * Reads `limitlessAccount.ownerId` from an ensure-account payload (supports nested `data`).
 */
export function readLimitlessOwnerIdFromEnsurePayload(raw: unknown): number | null {
	if (raw == null || typeof raw !== "object") return null;
	const inner = unwrapLimitlessEnsureInner(raw as Record<string, unknown>);
	const la = inner.limitlessAccount;
	if (!la || typeof la !== "object") return null;
	return coercePositivePartnerOwnerId((la as Record<string, unknown>).ownerId);
}

/**
 * Partner-reported approvals complete on ensure-account (Predict-style server flag).
 * When true, skip client-driven Base warmup; first trade JIT still repairs gaps.
 */
export function readLimitlessApprovalCompleteFromEnsurePayload(raw: unknown): boolean {
	if (raw == null || typeof raw !== "object") return false;
	const inner = unwrapLimitlessEnsureInner(raw as Record<string, unknown>);
	const la = inner.limitlessAccount;
	if (!la || typeof la !== "object") return false;
	return Boolean((la as Record<string, unknown>).approvalComplete);
}

/**
 * Interprets `POST /api/limitless/ensure-account` payload (after client `{ data }` unwrap).
 * Legacy deployments may still return `profileId` / `account` at the top level.
 */
export type LimitlessEnsureNotReadyCode =
	| "NO_DATA"
	| "VENUE_NOT_REGISTERED"
	| "MISSING_LIMITLESS_ACCOUNT"
	| "OWNER_NOT_PROVISIONED";

export type LimitlessEnsureTradeGateResult = {
	ready: boolean;
	blockedReason: string | null;
	/** Set when `ready` is false; use for dev diagnostics (not user-facing button copy). */
	notReadyCode: LimitlessEnsureNotReadyCode | null;
};

export function getLimitlessEnsureTradeGate(data: unknown): LimitlessEnsureTradeGateResult {
	if (data == null || typeof data !== "object") {
		return {
			ready: false,
			blockedReason: null,
			notReadyCode: "NO_DATA",
		};
	}
	const d = data as Record<string, unknown>;

	const pid = d.profileId;
	if (typeof pid === "number" && Number.isFinite(pid)) {
		return { ready: true, blockedReason: null, notReadyCode: null };
	}
	if (typeof pid === "string" && pid.trim() !== "" && Number.isFinite(Number(pid))) {
		return { ready: true, blockedReason: null, notReadyCode: null };
	}
	if (typeof d.account === "string" && d.account.trim().length > 0) {
		return { ready: true, blockedReason: null, notReadyCode: null };
	}

	if (d.venueRegistered !== true) {
		return {
			ready: false,
			blockedReason: null,
			notReadyCode: "VENUE_NOT_REGISTERED",
		};
	}

	const la = d.limitlessAccount;
	if (!la || typeof la !== "object") {
		return {
			ready: false,
			blockedReason: null,
			notReadyCode: "MISSING_LIMITLESS_ACCOUNT",
		};
	}
	const acc = la as Record<string, unknown>;
	const oid = coercePositivePartnerOwnerId(acc.ownerId);
	const provisioned = oid != null;
	if (!provisioned) {
		return {
			ready: false,
			blockedReason: null,
			notReadyCode: "OWNER_NOT_PROVISIONED",
		};
	}

	return { ready: true, blockedReason: null, notReadyCode: null };
}

/** Maps `notReadyCode` to a stable dev-log label (snake_case). */
export function limitlessEnsureNotReadyCodeToWhy(
	code: LimitlessEnsureNotReadyCode | null,
): string | null {
	if (code == null) return null;
	switch (code) {
		case "NO_DATA":
			return "no_ensure_data";
		case "VENUE_NOT_REGISTERED":
			return "venue_not_registered";
		case "MISSING_LIMITLESS_ACCOUNT":
			return "missing_limitless_account";
		case "OWNER_NOT_PROVISIONED":
			return "owner_not_provisioned";
		default:
			return "unknown_gate";
	}
}

/** Successful ensure touched venue state — refresh account overview if mounted. */
export function limitlessEnsureWarrantsAccountOverviewRefresh(data: unknown): boolean {
	if (data == null || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	if (d.venueRegistered === true) return true;
	const pid = d.profileId;
	if (typeof pid === "number" && Number.isFinite(pid)) return true;
	if (typeof pid === "string" && pid.trim() !== "" && Number.isFinite(Number(pid))) return true;
	return typeof d.account === "string" && d.account.trim().length > 0;
}

/** Terminal ensure-account failure — do not React Query retry (would re-hammer createAccount). */
export function isLimitlessProfileExistsNotLinkedApiError(err: unknown): boolean {
	if (err == null || typeof err !== "object") return false;
	const status = (err as { status?: unknown }).status;
	if (status !== 409) return false;
	const body = (err as { body?: unknown }).body;
	if (body == null || typeof body !== "object") return false;
	return (body as Record<string, unknown>).code === "LIMITLESS_PROFILE_EXISTS_NOT_LINKED";
}
