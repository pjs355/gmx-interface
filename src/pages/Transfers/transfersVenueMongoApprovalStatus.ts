import type { SorVenue } from "@/features/trading/sor/core/sor-types";
import type { PolymarketAccountResponse } from "@/types/trading";
import type { PredictAccountResponse } from "@/services/privateApi/client";
import type { DflowAccountResponse } from "@/services/privateApi";
import { readLimitlessApprovalCompleteFromEnsurePayload } from "@/features/trading/venues/limitless/session/limitlessEnsureTradeGate";

/** What predictions-api / GET account endpoints persist — not on-chain truth. */
export type TransfersVenueMongoApprovalDebug = {
	venue: SorVenue;
	/** Short label for the debug badge */
	label: string;
	/** Whether Mongo says ready, when the venue stores a boolean; null = N/A */
	ready: boolean | null;
	/** One-line detail for dev inspection */
	detail: string;
};

function flag(v: unknown): string {
	if (v === true) return "true";
	if (v === false) return "false";
	if (v === undefined) return "unset";
	if (v === null) return "null";
	return String(v);
}

export function readLevelUpMongoApprovalDebug(): TransfersVenueMongoApprovalDebug {
	return {
		venue: "levelup",
		label: "Mongo N/A",
		ready: null,
		detail: "LevelUp token approvals are not stored in Mongo — client reads Base chain only.",
	};
}

export function readPolymarketMongoApprovalDebug(
	poly: PolymarketAccountResponse | null | undefined,
	isLoading: boolean,
): TransfersVenueMongoApprovalDebug {
	if (isLoading) {
		return {
			venue: "polymarket",
			label: "Mongo …",
			ready: null,
			detail: "loading GET /polymarket/account",
		};
	}
	const state = poly?.polymarketAccount;
	if (!state || poly?._clientPolymarketAccountNotFound) {
		return {
			venue: "polymarket",
			label: "Mongo missing",
			ready: null,
			detail: "no polymarket account row",
		};
	}
	const safeDeployed = state.safeDeployed === true;
	const usdcApprovalComplete = state.usdcApprovalComplete === true;
	const ctfApprovalComplete = state.ctfApprovalComplete === true;
	const collateralOnrampUsdceApprovalComplete =
		state.collateralOnrampUsdceApprovalComplete === true;
	const collateralOfframpPusdApprovalComplete =
		state.collateralOfframpPusdApprovalComplete === true;
	const ready =
		safeDeployed &&
		usdcApprovalComplete &&
		ctfApprovalComplete &&
		collateralOnrampUsdceApprovalComplete &&
		collateralOfframpPusdApprovalComplete;
	const detail = [
		`safeDeployed=${flag(state.safeDeployed)}`,
		`usdcApprovalComplete=${flag(state.usdcApprovalComplete)}`,
		`ctfApprovalComplete=${flag(state.ctfApprovalComplete)}`,
		`collateralOnrampUsdceApprovalComplete=${flag(state.collateralOnrampUsdceApprovalComplete)}`,
		`collateralOfframpPusdApprovalComplete=${flag(state.collateralOfframpPusdApprovalComplete)}`,
		`tradingEnabled=${flag(state.tradingEnabled)}`,
	].join(" · ");
	return {
		venue: "polymarket",
		label: ready ? "Mongo approved" : "Mongo incomplete",
		ready,
		detail,
	};
}

export function readPredictMongoApprovalDebug(
	account: PredictAccountResponse | null | undefined,
	isLoading: boolean,
): TransfersVenueMongoApprovalDebug {
	if (isLoading) {
		return {
			venue: "predictfun",
			label: "Mongo …",
			ready: null,
			detail: "loading GET /predict/account",
		};
	}
	if (!account?.predictAccount) {
		return {
			venue: "predictfun",
			label: "Mongo missing",
			ready: null,
			detail: "no predict account row",
		};
	}
	const st = account.predictAccount;
	const ready = st.approvalComplete === true;
	const detail = [
		`approvalComplete=${flag(st.approvalComplete)}`,
		`tradingEnabled=${flag(st.tradingEnabled)}`,
		`hasJwt=${flag(st.hasJwt)}`,
	].join(" · ");
	return {
		venue: "predictfun",
		label: ready ? "Mongo approved" : "Mongo incomplete",
		ready,
		detail,
	};
}

export function readLimitlessMongoApprovalDebug(
	ensurePayload: unknown,
	profileId: string | null | undefined,
): TransfersVenueMongoApprovalDebug {
	if (!profileId) {
		return {
			venue: "limitless",
			label: "Mongo …",
			ready: null,
			detail: "profile id missing",
		};
	}
	if (ensurePayload == null) {
		return {
			venue: "limitless",
			label: "Mongo unset",
			ready: null,
			detail: "ensure-account cache empty (approvalComplete lives on limitlessAccount row)",
		};
	}
	const ready = readLimitlessApprovalCompleteFromEnsurePayload(ensurePayload);
	const detail = `approvalComplete=${flag(ready)} (optimistic after verify-allowance)`;
	return {
		venue: "limitless",
		label: ready ? "Mongo approved" : "Mongo incomplete",
		ready,
		detail,
	};
}

export function readDflowMongoProofDebug(
	account: DflowAccountResponse | null | undefined,
	isLoading: boolean,
): TransfersVenueMongoApprovalDebug {
	if (isLoading) {
		return {
			venue: "dflow",
			label: "Mongo …",
			ready: null,
			detail: "loading GET /dflow/account",
		};
	}
	const ps = account?.proofState;
	if (!ps) {
		return {
			venue: "dflow",
			label: "Mongo missing",
			ready: null,
			detail: "no proofState row — DFlow uses Proof KYC, not token approvals",
		};
	}
	const ready = Boolean(ps.identityVerified && ps.ownershipProofValid);
	const detail = [
		`identityVerified=${flag(ps.identityVerified)}`,
		`ownershipProofValid=${flag(ps.ownershipProofValid)}`,
	].join(" · ");
	return {
		venue: "dflow",
		label: ready ? "Mongo verified" : "Mongo not verified",
		ready,
		detail,
	};
}

export type TransfersVenueMongoApprovalMap = Record<SorVenue, TransfersVenueMongoApprovalDebug>;
