import { userMessage, TRADE_PREDICT_APPROVALS_INCOMPLETE } from "@/errors";
import type {
	ApprovalRuntime,
	PredictApprovalEnsureScope,
} from "@/features/trading/approvals/types";

export async function ensurePredictApprovals(
	runtime: ApprovalRuntime,
	scope?: PredictApprovalEnsureScope,
): Promise<void> {
	if (runtime.predictApprovalsQuery.data === true) return;

	const isNegRisk = scope?.isNegRisk ?? runtime.predictMarketDetail?.isNegRisk ?? false;
	const isYieldBearing =
		scope?.isYieldBearing ?? runtime.predictMarketDetail?.isYieldBearing ?? false;

	await runtime.predictSession.setApprovals({ isNegRisk, isYieldBearing });
	await runtime.queryClient.invalidateQueries({ queryKey: ["predict-approvals"] });
	const refreshed = await runtime.predictApprovalsQuery.refetch();
	if (!refreshed.data) {
		throw new Error(userMessage(TRADE_PREDICT_APPROVALS_INCOMPLETE));
	}
}
