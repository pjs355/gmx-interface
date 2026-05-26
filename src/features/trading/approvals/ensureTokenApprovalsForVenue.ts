import { ensureLimitlessApprovals } from "@/features/trading/venues/limitless/approvals/limitlessApprovalAdapter";
import { ensurePolymarketApprovals } from "@/features/trading/venues/polymarket/approvals/polymarketApprovalAdapter";
import { ensurePredictApprovals } from "@/features/trading/venues/predict/approvals/predictApprovalAdapter";
import type { ApprovalEnsureScope, ApprovalRuntime, TokenApprovalVenueKey } from "./types";

export async function ensureTokenApprovalsForVenue<V extends TokenApprovalVenueKey>(
	runtime: ApprovalRuntime,
	venue: V,
	scope?: ApprovalEnsureScope<V>,
): Promise<void> {
	switch (venue) {
		case "levelup":
			await runtime.ensureLevelUpApprovals();
			return;
		case "predictfun":
			await ensurePredictApprovals(runtime, scope as ApprovalEnsureScope<"predictfun">);
			return;
		case "polymarket":
			await ensurePolymarketApprovals(runtime, scope as ApprovalEnsureScope<"polymarket">);
			return;
		case "limitless": {
			const limitlessScope = scope as ApprovalEnsureScope<"limitless">;
			if (
				!limitlessScope ||
				typeof limitlessScope !== "object" ||
				!("marketSlug" in limitlessScope)
			) {
				throw new Error("ensureTokenApprovals(limitless): marketSlug and side are required");
			}
			await ensureLimitlessApprovals(runtime, limitlessScope);
			return;
		}
		default: {
			const _exhaustive: never = venue;
			throw new Error(`Unknown approval venue: ${String(_exhaustive)}`);
		}
	}
}
