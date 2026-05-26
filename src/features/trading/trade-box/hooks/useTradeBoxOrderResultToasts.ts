/**
 * Toast notifications for completed/failed trades (`state.orderResult`).
 *
 * Dedupes by signature so re-renders do not spam toasts. Used by
 * `PredictionMarketTradeBox` on the container layer (not inside UI).
 */
import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { TOAST_AUTO_CLOSE_TIME } from "config/ui";
import type { TradeBoxCoreState } from "../types";

export function useTradeBoxOrderResultToasts(orderResult: TradeBoxCoreState["orderResult"]): void {
	const orderResultToastSigRef = useRef<string | null>(null);
	const orderResultToastDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		if (!orderResult) {
			orderResultToastSigRef.current = null;
			return;
		}
		const r = orderResult;
		const sig = [
			r.success ? "ok" : "fail",
			r.error ?? "",
			r.transactionHash ?? "",
			r.orderId ?? "",
		].join("|");
		if (orderResultToastSigRef.current === sig) {
			return;
		}
		orderResultToastSigRef.current = sig;

		const toastId = r.success ? "prediction-trade-result-ok" : "prediction-trade-result-fail";

		toast.dismiss();

		const toastOpts = {
			toastId,
			autoClose: TOAST_AUTO_CLOSE_TIME,
			pauseOnHover: false,
			pauseOnFocusLoss: false,
			closeOnClick: true,
		} as const;

		if (r.success) {
			toast.success("Order confirmed!", toastOpts);
		} else {
			toast.error(
				r.error?.trim() || "Order could not be completed. Check your wallet and try again.",
				toastOpts,
			);
		}

		if (orderResultToastDismissTimerRef.current) {
			clearTimeout(orderResultToastDismissTimerRef.current);
		}
		orderResultToastDismissTimerRef.current = setTimeout(() => {
			toast.dismiss(toastId);
			orderResultToastDismissTimerRef.current = null;
		}, TOAST_AUTO_CLOSE_TIME);
	}, [orderResult]);

	useEffect(() => {
		return () => {
			if (orderResultToastDismissTimerRef.current) {
				clearTimeout(orderResultToastDismissTimerRef.current);
				orderResultToastDismissTimerRef.current = null;
			}
			toast.dismiss("prediction-trade-result-ok");
			toast.dismiss("prediction-trade-result-fail");
		};
	}, []);
}
