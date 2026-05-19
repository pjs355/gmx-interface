import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import {
	formatAdminErrorForUser,
	formatAdminHttpError,
	ADMIN_SETTLE_MARKET_FAILED,
	ADMIN_OPERATION_FAILED,
	adminErrorMessage,
} from "@/errors";

interface SettleMarketProps {
	questionId: string;
	status?: string;
	resolvedOutcome?: "yes" | "no" | null;
	resolvedAt?: string;
}

export default function SettleMarket({
	questionId,
	status,
	resolvedOutcome,
	resolvedAt,
}: SettleMarketProps) {
	const { getAccessToken } = usePrivy();
	const [settleOutcome, setSettleOutcome] = useState<"yes" | "no" | null>(
		null
	);
	const [settling, setSettling] = useState<boolean>(false);
	const [settleMsg, setSettleMsg] = useState<string | null>(null);
	const [settleErr, setSettleErr] = useState<string | null>(null);

	async function settleQuestion() {
		if (!questionId) {
			setSettleErr("Missing questionId");
			return;
		}
		if (!settleOutcome) {
			setSettleErr("Select an outcome (Yes/No)");
			return;
		}
		setSettling(true);
		setSettleMsg(null);
		setSettleErr(null);
		try {
			const token =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;
			const base = getPredictionApiBaseUrl();
			const resp = await fetch(
				`${base}/admin/markets/settle/${questionId}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify({ outcome: settleOutcome }),
				}
			);
			const json = await resp.json().catch(() => ({} as any));
			if (!resp.ok || !json?.success) {
				throw new Error(formatAdminHttpError(resp.status, json?.error));
			}
			setSettleMsg("Settlement submitted");
		} catch (e: unknown) {
			console.error("error", e);
			const msg = formatAdminErrorForUser(e);
			setSettleErr(
				msg === adminErrorMessage(ADMIN_OPERATION_FAILED)
					? adminErrorMessage(ADMIN_SETTLE_MARKET_FAILED)
					: msg,
			);
		} finally {
			setSettling(false);
		}
	}

	// If market is already resolved, show the result instead of settle buttons
	const isResolved = status === "resolved" && resolvedOutcome;

	if (isResolved) {
		const formattedDate = resolvedAt
			? new Date(resolvedAt).toLocaleString()
			: "Unknown date";

		return (
			<div
				style={{
					display: "grid",
					gap: 6,
					marginTop: 8,
					borderTop: "1px solid rgba(255,255,255,0.2)",
					paddingTop: 12,
					order: 2,
				}}
			>
				<span>Settlement Status</span>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						padding: "12px 16px",
						background: "rgba(255,255,255,0.05)",
						borderRadius: 8,
						border: `2px solid ${
							resolvedOutcome === "yes" ? "#22c55e" : "#ef4444"
						}`,
					}}
				>
					<div
						style={{
							width: 12,
							height: 12,
							borderRadius: "50%",
							background:
								resolvedOutcome === "yes"
									? "#22c55e"
									: "#ef4444",
						}}
					/>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 2,
						}}
					>
						<span
							style={{
								fontWeight: 600,
								fontSize: 16,
								color:
									resolvedOutcome === "yes"
										? "#22c55e"
										: "#ef4444",
							}}
						>
							Settled: {resolvedOutcome.toUpperCase()}
						</span>
						<span style={{ fontSize: 12, opacity: 0.7 }}>
							{formattedDate}
						</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			style={{
				display: "grid",
				gap: 6,
				marginTop: 8,
				borderTop: "1px solid rgba(255,255,255,0.2)",
				paddingTop: 12,
				order: 2,
			}}
		>
			<span>Settle Market</span>
			<div style={{ display: "flex", gap: 8 }}>
				<button
					type="button"
					onClick={() => setSettleOutcome("yes")}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background:
							settleOutcome === "yes"
								? "rgba(255,255,255,0.2)"
								: "transparent",
						color: "white",
						cursor: "pointer",
					}}
				>
					Yes
				</button>
				<button
					type="button"
					onClick={() => setSettleOutcome("no")}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background:
							settleOutcome === "no"
								? "rgba(255,255,255,0.2)"
								: "transparent",
						color: "white",
						cursor: "pointer",
					}}
				>
					No
				</button>
			</div>
			<div style={{ display: "flex", gap: 8 }}>
				<button
					type="button"
					onClick={settleQuestion}
					disabled={settling || !settleOutcome}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
						color: "white",
					}}
				>
					{settling ? "Settling..." : "Settle"}
				</button>
				{settleMsg && (
					<span style={{ color: "#22c55e" }}>{settleMsg}</span>
				)}
				{settleErr && (
					<span style={{ color: "#ff6b6b" }}>{settleErr}</span>
				)}
			</div>
		</div>
	);
}
