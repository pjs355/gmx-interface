import { formatErrorForUser } from "@/errors";
import type { SorExecutionPhase } from "@/features/trading/sor/core/useSorExecution";
import type {
	ApprovalEnsureScope,
	TokenApprovalVenueKey,
} from "@/features/trading/approvals/types";
import type { UseSorLegExecutorDeps } from "./deps";

type RunSorTokenApprovalsGateParams<V extends TokenApprovalVenueKey> = {
	ensureTokenApprovals: UseSorLegExecutorDeps["ensureTokenApprovals"];
	venue: V;
	scope?: ApprovalEnsureScope<V>;
	reportSorExecutionPhase: (phase: SorExecutionPhase) => void;
	/** Polymarket: only flip to approving when relay batch actually runs. */
	polymarketTrackApprovalWork?: boolean;
};

/**
 * Run token approval gate for one SOR leg. Returns an error message or null on success.
 */
export async function runSorTokenApprovalsGate<V extends TokenApprovalVenueKey>(
	params: RunSorTokenApprovalsGateParams<V>,
): Promise<string | null> {
	const { ensureTokenApprovals, venue, scope, reportSorExecutionPhase } = params;
	if (!ensureTokenApprovals) return null;

	if (venue === "polymarket" && params.polymarketTrackApprovalWork) {
		let didApprovalWork = false;
		try {
			await ensureTokenApprovals("polymarket", {
				...(scope as ApprovalEnsureScope<"polymarket">),
				onApprovalWorkStart: () => {
					didApprovalWork = true;
					reportSorExecutionPhase("approving_trades");
				},
			});
		} catch (e: unknown) {
			return formatErrorForUser(e);
		} finally {
			if (didApprovalWork) {
				reportSorExecutionPhase("executing_trade");
			}
		}
		return null;
	}

	reportSorExecutionPhase("approving_trades");
	try {
		await ensureTokenApprovals(venue, scope);
	} catch (e: unknown) {
		return formatErrorForUser(e);
	} finally {
		reportSorExecutionPhase("executing_trade");
	}
	return null;
}
