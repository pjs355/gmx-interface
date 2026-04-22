/**
 * Interprets `POST /api/limitless/ensure-account` payload (after client `{ data }` unwrap).
 * Legacy deployments may still return `profileId` / `account` at the top level.
 */
export function getLimitlessEnsureTradeGate(data: unknown): {
	ready: boolean;
	blockedReason: string | null;
} {
	if (data == null || typeof data !== "object") {
		return { ready: false, blockedReason: null };
	}
	const d = data as Record<string, unknown>;

	const pid = d.profileId;
	if (typeof pid === "number" && Number.isFinite(pid)) {
		return { ready: true, blockedReason: null };
	}
	if (typeof pid === "string" && pid.trim() !== "" && Number.isFinite(Number(pid))) {
		return { ready: true, blockedReason: null };
	}
	if (typeof d.account === "string" && d.account.trim().length > 0) {
		return { ready: true, blockedReason: null };
	}

	if (d.venueRegistered !== true) {
		return {
			ready: false,
			blockedReason:
				"Limitless account not provisioned. Connect a Base wallet (or smart wallet), then refresh this page.",
		};
	}

	const la = d.limitlessAccount;
	if (!la || typeof la !== "object") {
		return { ready: false, blockedReason: null };
	}
	const acc = la as Record<string, unknown>;
	const oid = acc.ownerId;
	const provisioned =
		typeof oid === "number" && Number.isFinite(oid) && oid > 0;
	if (!provisioned) {
		return {
			ready: false,
			blockedReason:
				"Limitless sub-account is still provisioning. Wait a few seconds and refresh, or try again after ensure-account completes.",
		};
	}

	return { ready: true, blockedReason: null };
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
