import React, { useState, useCallback, useMemo } from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { CTF_ADDRESS } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";
import { subgraphService, fromMicroUnits } from "@/services/subgraph/subgraphService";
import { usePredictionData } from "context/PredictionDataContext";
import { useUserData } from "context/UserDataContext";

interface RowData {
	market: string;
	marketId: string;
	side: "Yes" | "No";
	subgraph: number | null;  // null when subgraph unavailable
	rpc: number;
	expected: number;  // Calculated from orders
	sgMatchRpc: boolean | null;  // null when subgraph unavailable
	rpcMatchOrders: boolean;
}

interface BalanceCheckerProps {
	debugAccount: string;
}

export default function BalanceChecker({ debugAccount }: BalanceCheckerProps) {
	const { umbrellas, getAllQuestionsForUmbrella } = usePredictionData();
	const { orders } = useUserData();
	
	const [isChecking, setIsChecking] = useState(false);
	const [rows, setRows] = useState<RowData[]>([]);
	const [error, setError] = useState<string | null>(null);

	// Build token -> market lookup
	const tokenLookup = useMemo(() => {
		const lookup = new Map<string, { name: string; marketId: string; side: "Yes" | "No" }>();
		umbrellas.forEach(umbrella => {
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

	// Calculate expected balance from filled orders
	const getExpectedFromOrders = useCallback((marketId: string, side: "Yes" | "No"): number => {
		const marketOrders = orders.filter(
			o => o.questionId === marketId && o.filled && o.position === side
		);
		return marketOrders.reduce((sum, o) => {
			// Buy = +shares, Sell = -shares
			return sum + (o.side === "buy" ? o.tokenValue : -o.tokenValue);
		}, 0);
	}, [orders]);

	const scan = useCallback(async () => {
		setIsChecking(true);
		setError(null);
		setRows([]);

		try {
			const provider = new JsonRpcProvider(DEFAULT_RPC_URL);
			const ctf = new Contract(
				CTF_ADDRESS,
				["function balanceOf(address, uint256) view returns (uint256)"],
				provider
			);

			// Try to get subgraph data, but continue if it fails (rate limiting, etc.)
			let subgraphBalances = new Map<string, number>();
			let subgraphAvailable = false;
			
			try {
				const account = await subgraphService.getUserAccount(debugAccount.toLowerCase());
				if (account && account.tokenBalances) {
					subgraphAvailable = true;
					account.tokenBalances.forEach(t => {
						if (BigInt(t.balance) > 0n) {
							subgraphBalances.set(t.tokenId, parseFloat(fromMicroUnits(t.balance)));
						}
					});
				}
			} catch (sgErr) {
				console.warn("Subgraph unavailable (rate limited?), continuing with RPC only:", sgErr);
				// Continue without subgraph data
			}

			// Get token IDs to check from multiple sources:
			// 1. Subgraph balances (if available)
			// 2. Orders (tokens we've traded)
			// 3. Token lookup (all known market tokens)
			const tokenIdsToCheck = new Set<string>();
			
			// Add tokens from subgraph
			subgraphBalances.forEach((_, tokenId) => tokenIdsToCheck.add(tokenId));
			
			// Add tokens from orders (any token we've traded should be checked)
			orders.forEach(order => {
				if (order.tokenId) tokenIdsToCheck.add(order.tokenId);
			});

			// If we have no tokens to check, show a message
			if (tokenIdsToCheck.size === 0) {
				setError("No tokens found to check (no subgraph data, no orders)");
				setIsChecking(false);
				return;
			}

			const results: RowData[] = [];

			for (const tokenId of tokenIdsToCheck) {
				const subgraphBal = subgraphAvailable ? (subgraphBalances.get(tokenId) ?? 0) : null;
				
				// Get RPC balance
				let rpcBal = 0;
				try {
					const bal = await ctf.balanceOf(debugAccount, tokenId);
					rpcBal = parseFloat(formatUnits(bal, 6));
				} catch (e) {
					console.error("RPC error for", tokenId);
				}

				// Skip if both subgraph and RPC show 0 (no position)
				if ((subgraphBal === null || subgraphBal === 0) && rpcBal === 0) {
					continue;
				}

				const info = tokenLookup.get(tokenId);
				const marketId = info?.marketId || "";
				const side = info?.side || "Yes";
				
				// Calculate expected from orders
				const expected = getExpectedFromOrders(marketId, side);

				// Determine if subgraph matches RPC (null if subgraph unavailable)
				const sgMatchRpc = subgraphBal !== null 
					? Math.abs(subgraphBal - rpcBal) < 0.01 
					: null;

				results.push({
					market: info?.name || `Token: ${tokenId.slice(0, 12)}...`,
					marketId,
					side,
					subgraph: subgraphBal,
					rpc: rpcBal,
					expected,
					sgMatchRpc,
					rpcMatchOrders: Math.abs(rpcBal - expected) < 0.01,
				});
			}

			// Sort: problems first (RPC doesn't match orders), then by market name
			results.sort((a, b) => {
				if (a.rpcMatchOrders !== b.rpcMatchOrders) return a.rpcMatchOrders ? 1 : -1;
				if (a.sgMatchRpc !== b.sgMatchRpc) {
					// Handle null (unavailable) as neutral
					const aVal = a.sgMatchRpc === null ? 0.5 : (a.sgMatchRpc ? 1 : 0);
					const bVal = b.sgMatchRpc === null ? 0.5 : (b.sgMatchRpc ? 1 : 0);
					return bVal - aVal;
				}
				return a.market.localeCompare(b.market);
			});

			setRows(results);
			
			// Show warning if subgraph was unavailable
			if (!subgraphAvailable && results.length > 0) {
				setError("⚠️ Subgraph unavailable (rate limited?) - showing RPC & Orders only");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Error");
		} finally {
			setIsChecking(false);
		}
	}, [debugAccount, tokenLookup, getExpectedFromOrders, orders]);

	const orderMismatches = rows.filter(r => !r.rpcMatchOrders).length;
	const sgMismatches = rows.filter(r => r.sgMatchRpc === false).length;
	const sgUnavailable = rows.filter(r => r.sgMatchRpc === null).length;

	return (
		<div style={{ background: '#111', border: '1px solid #333', marginBottom: 16, fontSize: 13 }}>
			{/* Header */}
			<div style={{ 
				padding: '8px 12px', 
				borderBottom: '1px solid #333', 
				display: 'flex', 
				justifyContent: 'space-between',
				alignItems: 'center',
			}}>
				<span style={{ fontWeight: 600 }}>🔬 Balance Check: Subgraph vs RPC vs Orders</span>
				<button
					onClick={scan}
					disabled={isChecking}
					style={{
						padding: '6px 12px',
						background: isChecking ? '#333' : '#8b5cf6',
						border: 'none',
						borderRadius: 4,
						color: '#fff',
						cursor: isChecking ? 'wait' : 'pointer',
						fontSize: 12,
					}}
				>
					{isChecking ? "Scanning..." : "Scan"}
				</button>
			</div>

			{error && (
				<div style={{ padding: 12, color: '#ef4444' }}>Error: {error}</div>
			)}

			{rows.length > 0 && (
				<>
					{/* Summary */}
					<div style={{ 
						padding: '8px 12px', 
						background: orderMismatches > 0 ? '#2d1f1f' : '#1f2d1f',
						color: orderMismatches > 0 ? '#ef4444' : '#22c55e',
						fontWeight: 600,
						display: 'flex',
						gap: 16,
						flexWrap: 'wrap',
					}}>
						{orderMismatches > 0 
							? <span>⚠️ {orderMismatches} order mismatch{orderMismatches > 1 ? 'es' : ''} (RPC ≠ Orders)</span>
							: <span>✓ All {rows.length} positions match orders</span>}
						{sgMismatches > 0 && (
							<span style={{ color: '#fbbf24' }}>
								| {sgMismatches} subgraph out of sync
							</span>
						)}
						{sgUnavailable > 0 && (
							<span style={{ color: '#888' }}>
								| Subgraph: N/A (rate limited)
							</span>
						)}
					</div>

					{/* Table */}
					<div style={{ overflowX: 'auto' }}>
						<table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
							<thead>
								<tr style={{ background: '#1a1a1a', textAlign: 'left' }}>
									<th style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>Market</th>
									<th style={{ padding: '8px 12px', borderBottom: '1px solid #333', textAlign: 'center', width: 50 }}>Side</th>
									<th style={{ padding: '8px 12px', borderBottom: '1px solid #333', textAlign: 'right', width: 100 }}>Subgraph</th>
									<th style={{ padding: '8px 12px', borderBottom: '1px solid #333', textAlign: 'right', width: 100 }}>RPC</th>
									<th style={{ padding: '8px 12px', borderBottom: '1px solid #333', textAlign: 'right', width: 100 }}>Expected</th>
									<th style={{ padding: '8px 12px', borderBottom: '1px solid #333', textAlign: 'center', width: 70 }}>SG=RPC</th>
									<th style={{ padding: '8px 12px', borderBottom: '1px solid #333', textAlign: 'center', width: 80 }}>RPC=Ord</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row, i) => {
									const hasOrderProblem = !row.rpcMatchOrders;
									const hasSgProblem = row.sgMatchRpc === false; // Only false, not null
									const bgColor = hasOrderProblem 
										? '#2d1f1f' 
										: hasSgProblem 
											? '#2d2d1f' 
											: (i % 2 === 0 ? '#0d0d0d' : '#111');
									
									return (
										<tr key={i} style={{ background: bgColor }}>
											<td style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>
												{row.market}
											</td>
											<td style={{ 
												padding: '8px 12px', 
												borderBottom: '1px solid #222', 
												textAlign: 'center',
												color: row.side === 'Yes' ? '#22c55e' : '#ef4444',
												fontWeight: 600,
											}}>
												{row.side}
											</td>
											<td style={{ 
												padding: '8px 12px', 
												borderBottom: '1px solid #222', 
												textAlign: 'right',
												fontFamily: 'monospace',
												color: row.subgraph === null ? '#555' : (hasSgProblem ? '#fbbf24' : '#888'),
											}}>
												{row.subgraph === null ? '-' : row.subgraph.toLocaleString()}
											</td>
											<td style={{ 
												padding: '8px 12px', 
												borderBottom: '1px solid #222', 
												textAlign: 'right',
												fontFamily: 'monospace',
												fontWeight: 600,
											}}>
												{row.rpc.toLocaleString()}
											</td>
											<td style={{ 
												padding: '8px 12px', 
												borderBottom: '1px solid #222', 
												textAlign: 'right',
												fontFamily: 'monospace',
												color: hasOrderProblem ? '#ef4444' : '#888',
												fontWeight: hasOrderProblem ? 600 : 400,
											}}>
												{row.expected.toLocaleString()}
											</td>
											<td style={{ 
												padding: '8px 12px', 
												borderBottom: '1px solid #222', 
												textAlign: 'center',
												color: row.sgMatchRpc === null ? '#555' : (row.sgMatchRpc ? '#22c55e' : '#fbbf24'),
											}}>
												{row.sgMatchRpc === null ? '-' : (row.sgMatchRpc ? '✓' : '✗')}
											</td>
											<td style={{ 
												padding: '8px 12px', 
												borderBottom: '1px solid #222', 
												textAlign: 'center',
												color: row.rpcMatchOrders ? '#22c55e' : '#ef4444',
												fontWeight: 600,
											}}>
												{row.rpcMatchOrders ? '✓' : '✗'}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{/* Legend */}
					<div style={{ padding: '8px 12px', fontSize: 11, color: '#666', borderTop: '1px solid #222' }}>
						<strong>Subgraph</strong> = what subgraph reports | 
						<strong> RPC</strong> = actual on-chain balance | 
						<strong> Expected</strong> = calculated from filled orders | 
						<strong> SG=RPC</strong> = subgraph matches blockchain | 
						<strong> RPC=Ord</strong> = blockchain matches order math
					</div>
				</>
			)}
		</div>
	);
}
