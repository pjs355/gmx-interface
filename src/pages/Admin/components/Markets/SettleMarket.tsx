import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

interface SettleMarketProps {
	questionId: string;
}

export default function SettleMarket({ questionId }: SettleMarketProps) {
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
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}
			setSettleMsg("Settlement submitted");
		} catch (e: any) {
			console.error("error", e);
			setSettleErr(e?.message || String(e));
		} finally {
			setSettling(false);
		}
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

