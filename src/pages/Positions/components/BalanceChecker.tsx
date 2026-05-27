import { useState, useCallback, useMemo } from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { getCTFAddress } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";
import { usePredictionData } from "context/PredictionDataContext";
import { useLevelUpOrders } from "@/features/trading/venues/levelup/portfolio/useLevelUpOrders";

interface RowData {
	market: string;
	marketId: string;
	side: "Yes" | "No";
	rpc: number;
	expected: number;
	rpcMatchOrders: boolean;
}

interface BalanceCheckerProps {
	debugAccount: string;
}

export default function BalanceChecker({ debugAccount }: BalanceCheckerProps) {
	const { umbrellas, getAllQuestionsForUmbrella } = usePredictionData();
	const { orders } = useLevelUpOrders(debugAccount, Boolean(debugAccount?.trim()));

	const [isChecking, setIsChecking] = useState(false);
	const [rows, setRows] = useState<RowData[]>([]);
	const [error, setError] = useState<string | null>(null);

	const tokenLookup = useMemo(() => {
		const lookup = new Map<string, { name: string; marketId: string; side: "Yes" | "No" }>();
		umbrellas.forEach((umbrella) => {
			const questions = getAllQuestionsForUmbrella(umbrella._id) || [];
			questions.forEach((market: any) => {
				const name = market.displayName || market.question || "Unknown";
				const marketId = market._id || market.questionId || market.marketId;
				if (market.yesTokenId) lookup.set(market.yesTokenId, { name, marketId, side: "Yes" });
				if (market.noTokenId) lookup.set(market.noTokenId, { name, marketId, side: "No" });
			});
		});
		return lookup;
	}, [umbrellas, getAllQuestionsForUmbrella]);

	const getExpectedFromOrders = useCallback(
		(marketId: string, side: "Yes" | "No"): number => {
			const marketOrders = orders.filter(
				(o) => o.questionId === marketId && o.filled && o.position === side,
			);
			return marketOrders.reduce((sum, o) => {
				return sum + (o.side === "buy" ? o.tokenValue : -o.tokenValue);
			}, 0);
		},
		[orders],
	);

	const scan = useCallback(async () => {
		setIsChecking(true);
		setError(null);
		setRows([]);

		try {
			const provider = new JsonRpcProvider(DEFAULT_RPC_URL);
			const ctf = new Contract(
				getCTFAddress(),
				["function balanceOf(address, uint256) view returns (uint256)"],
				provider,
			);

			const tokenIdsToCheck = new Set<string>();
			orders.forEach((order) => {
				if (order.tokenId) tokenIdsToCheck.add(order.tokenId);
			});

			if (tokenIdsToCheck.size === 0) {
				setError(
					"No token IDs on filled orders yet — refresh orders or trade once before running this checker.",
				);
				setIsChecking(false);
				return;
			}

			const results: RowData[] = [];

			for (const tokenId of tokenIdsToCheck) {
				let rpcBal = 0;
				try {
					const bal = await ctf.balanceOf(debugAccount, tokenId);
					rpcBal = Number.parseFloat(formatUnits(bal, 6));
				} catch (err) {
					console.error("error", err);
				}

				const info = tokenLookup.get(tokenId);
				const marketId = info?.marketId || "";
				const side = info?.side || "Yes";
				const expected = getExpectedFromOrders(marketId, side);

				if (rpcBal === 0 && expected === 0) {
					continue;
				}

				results.push({
					market: info?.name || `Token: ${tokenId.slice(0, 12)}...`,
					marketId,
					side,
					rpc: rpcBal,
					expected,
					rpcMatchOrders: Math.abs(rpcBal - expected) < 0.01,
				});
			}

			results.sort((a, b) => {
				if (a.rpcMatchOrders !== b.rpcMatchOrders) return a.rpcMatchOrders ? 1 : -1;
				return a.market.localeCompare(b.market);
			});

			setRows(results);
		} catch (err) {
			console.error("error", err);
			setError(err instanceof Error ? err.message : "Error");
		} finally {
			setIsChecking(false);
		}
	}, [debugAccount, tokenLookup, getExpectedFromOrders, orders]);

	const orderMismatches = rows.filter((r) => !r.rpcMatchOrders).length;

	return (
		<div style={{ background: "#111", border: "1px solid #333", marginBottom: 16, fontSize: 13 }}>
			<div
				style={{
					padding: "8px 12px",
					borderBottom: "1px solid #333",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<span style={{ fontWeight: 600 }}>Balance check: RPC vs orders</span>
				<button
					onClick={scan}
					disabled={isChecking}
					style={{
						padding: "6px 12px",
						background: isChecking ? "#333" : "var(--brand-primary)",
						border: "none",
						borderRadius: 4,
						color: "#fff",
						cursor: isChecking ? "wait" : "pointer",
						fontSize: 12,
					}}
				>
					{isChecking ? "Scanning..." : "Scan"}
				</button>
			</div>

			{error && <div style={{ padding: 12, color: "#ef4444" }}>Error: {error}</div>}

			{rows.length > 0 && (
				<>
					<div
						style={{
							padding: "8px 12px",
							background: orderMismatches > 0 ? "#2d1f1f" : "#1f2d1f",
							color: orderMismatches > 0 ? "#ef4444" : "#22c55e",
							fontWeight: 600,
							display: "flex",
							gap: 16,
							flexWrap: "wrap",
						}}
					>
						{orderMismatches > 0 ? (
							<span>
								{orderMismatches} mismatch{orderMismatches > 1 ? "es" : ""} (RPC ≠ orders)
							</span>
						) : (
							<span>All {rows.length} row(s): RPC matches order math</span>
						)}
					</div>

					<div style={{ overflowX: "auto" }}>
						<table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
							<thead>
								<tr style={{ background: "#1a1a1a", textAlign: "left" }}>
									<th style={{ padding: "8px 12px", borderBottom: "1px solid #333" }}>Market</th>
									<th
										style={{
											padding: "8px 12px",
											borderBottom: "1px solid #333",
											textAlign: "center",
											width: 50,
										}}
									>
										Side
									</th>
									<th
										style={{
											padding: "8px 12px",
											borderBottom: "1px solid #333",
											textAlign: "right",
											width: 100,
										}}
									>
										RPC
									</th>
									<th
										style={{
											padding: "8px 12px",
											borderBottom: "1px solid #333",
											textAlign: "right",
											width: 100,
										}}
									>
										Orders
									</th>
									<th
										style={{
											padding: "8px 12px",
											borderBottom: "1px solid #333",
											textAlign: "center",
											width: 80,
										}}
									>
										Match
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row, i) => {
									const hasOrderProblem = !row.rpcMatchOrders;
									const bgColor = hasOrderProblem ? "#2d1f1f" : i % 2 === 0 ? "#0d0d0d" : "#111";

									return (
										<tr key={i} style={{ background: bgColor }}>
											<td style={{ padding: "8px 12px", borderBottom: "1px solid #222" }}>
												{row.market}
											</td>
											<td
												style={{
													padding: "8px 12px",
													borderBottom: "1px solid #222",
													textAlign: "center",
													color: row.side === "Yes" ? "#22c55e" : "#ef4444",
													fontWeight: 600,
												}}
											>
												{row.side}
											</td>
											<td
												style={{
													padding: "8px 12px",
													borderBottom: "1px solid #222",
													textAlign: "right",
													fontFamily: "monospace",
													fontWeight: 600,
												}}
											>
												{row.rpc.toLocaleString()}
											</td>
											<td
												style={{
													padding: "8px 12px",
													borderBottom: "1px solid #222",
													textAlign: "right",
													fontFamily: "monospace",
													color: hasOrderProblem ? "#ef4444" : "#888",
													fontWeight: hasOrderProblem ? 600 : 400,
												}}
											>
												{row.expected.toLocaleString()}
											</td>
											<td
												style={{
													padding: "8px 12px",
													borderBottom: "1px solid #222",
													textAlign: "center",
													color: row.rpcMatchOrders ? "#22c55e" : "#ef4444",
													fontWeight: 600,
												}}
											>
												{row.rpcMatchOrders ? "✓" : "✗"}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					<div
						style={{
							padding: "8px 12px",
							fontSize: 11,
							color: "#666",
							borderTop: "1px solid #222",
						}}
					>
						<strong>RPC</strong> = <code>balanceOf</code> on the CTF contract.
						<strong> Orders</strong> = reconstructed from locally loaded filled orders only.
						Positions without matching order tokens in context are omitted.
					</div>
				</>
			)}
		</div>
	);
}
