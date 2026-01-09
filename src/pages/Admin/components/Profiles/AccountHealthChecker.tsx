/**
 * AccountHealthChecker - Verifies account share balances against order history
 * 
 * This tool fetches order history for accounts and compares expected share balances
 * (calculated from filled orders) against actual RPC balances on-chain.
 * 
 * NOTE: Does not check historical/claimed markets since tokens are burned after claiming.
 */

import { useState, useCallback } from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { CTF_ADDRESS } from "@/config/addresses";
import { DEFAULT_RPC_URL } from "@/config/rpc";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { fetchUserOrders, type ProcessedOrder } from "@/services/api/simplifiedOrderService";

export interface AccountHealthResult {
	profileId: string;
	wallet: string;
	username: string | null;
	isHealthy: boolean;
	totalExpectedPositions: number;
	totalMismatches: number;
	mismatchDetails: MismatchDetail[];
	checkedAt: Date;
	error?: string;
}

export interface MismatchDetail {
	marketId: string;
	tokenId: string;
	position: "Yes" | "No";
	expected: number;
	actual: number;
	difference: number;
}

interface Profile {
	_id: string;
	userId: string;
	username?: string;
	linked_accounts?: any[];
	smart_wallet?: string;
	wallet?: string;
}

interface MarketData {
	_id: string;
	questionId?: string;
	marketId?: string;
	yesTokenId: string;
	noTokenId: string;
	displayName?: string;
	question?: string;
	status?: string;
}

/**
 * Get smart wallet address from profile
 */
function getSmartWalletAddress(profile: Profile): string | null {
	const linkedSmartWallet = profile.linked_accounts?.find(
		(acc: any) => acc.type === "smart_wallet"
	);
	if (linkedSmartWallet?.address) {
		return linkedSmartWallet.address;
	}
	if (profile.smart_wallet) {
		return profile.smart_wallet;
	}
	if (profile.wallet) {
		return profile.wallet;
	}
	return null;
}

/**
 * Calculate expected share balance from filled orders
 */
function calculateExpectedBalance(
	orders: ProcessedOrder[],
	marketId: string,
	position: "Yes" | "No"
): number {
	const relevantOrders = orders.filter(
		(o) => o.questionId === marketId && o.filled && o.position === position
	);
	
	return relevantOrders.reduce((sum, o) => {
		// Buy = +shares, Sell = -shares
		return sum + (o.side === "buy" ? o.tokenValue : -o.tokenValue);
	}, 0);
}

interface AccountHealthCheckerProps {
	profiles: Profile[];
	accessToken: string | null;
	onHealthResults: (results: Map<string, AccountHealthResult>) => void;
}

export default function AccountHealthChecker({
	profiles,
	accessToken,
	onHealthResults,
}: AccountHealthCheckerProps) {
	const [isChecking, setIsChecking] = useState(false);
	const [progress, setProgress] = useState({ current: 0, total: 0 });
	const [results, setResults] = useState<Map<string, AccountHealthResult>>(new Map());
	const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);

	const runHealthCheck = useCallback(async () => {
		if (!accessToken) {
			console.error("No access token for health check");
			return;
		}

		setIsChecking(true);
		setProgress({ current: 0, total: profiles.length });
		
		const newResults = new Map<string, AccountHealthResult>();
		const provider = new JsonRpcProvider(DEFAULT_RPC_URL);
		const ctfContract = new Contract(
			CTF_ADDRESS,
			["function balanceOf(address, uint256) view returns (uint256)"],
			provider
		);

		// Fetch all active markets to build token lookup
		const API_BASE = getPredictionApiBaseUrl();
		let allMarkets: MarketData[] = [];
		
		try {
			const marketsResp = await fetch(`${API_BASE}/markets?status=active`);
			const marketsJson = await marketsResp.json();
			if (marketsJson.data && Array.isArray(marketsJson.data)) {
				allMarkets = marketsJson.data;
			}
		} catch (err) {
			console.error("Failed to fetch markets for health check:", err);
		}

		// Build token -> market lookup
		const tokenToMarket = new Map<string, { marketId: string; position: "Yes" | "No"; name: string }>();
		const marketDataMap = new Map<string, { yesTokenId: string; noTokenId: string }>();
		
		allMarkets.forEach((market) => {
			const marketId = market._id || market.questionId || market.marketId || "";
			const name = market.displayName || market.question || marketId;
			
			if (market.yesTokenId) {
				tokenToMarket.set(market.yesTokenId, { marketId, position: "Yes", name });
			}
			if (market.noTokenId) {
				tokenToMarket.set(market.noTokenId, { marketId, position: "No", name });
			}
			if (marketId && market.yesTokenId && market.noTokenId) {
				marketDataMap.set(marketId, {
					yesTokenId: market.yesTokenId,
					noTokenId: market.noTokenId,
				});
			}
		});

		// Check each profile
		for (let i = 0; i < profiles.length; i++) {
			const profile = profiles[i];
			const wallet = getSmartWalletAddress(profile);
			
			setProgress({ current: i + 1, total: profiles.length });

			if (!wallet) {
				newResults.set(profile._id, {
					profileId: profile._id,
					wallet: "N/A",
					username: profile.username || null,
					isHealthy: true, // No wallet = nothing to check
					totalExpectedPositions: 0,
					totalMismatches: 0,
					mismatchDetails: [],
					checkedAt: new Date(),
					error: "No wallet address",
				});
				continue;
			}

			try {
				// Fetch orders for this account
				const orders = await fetchUserOrders(wallet, marketDataMap);
				
				// Get unique market/token combinations from filled orders
				const positionsToCheck = new Map<string, { marketId: string; tokenId: string; position: "Yes" | "No" }>();
				
				orders
					.filter((o) => o.filled)
					.forEach((o) => {
						const key = `${o.questionId}-${o.position}`;
						if (!positionsToCheck.has(key)) {
							positionsToCheck.set(key, {
								marketId: o.questionId,
								tokenId: o.tokenId,
								position: o.position,
							});
						}
					});

				const mismatchDetails: MismatchDetail[] = [];
				let totalChecked = 0;

				// Check each position
				for (const [, pos] of positionsToCheck) {
					totalChecked++;
					
					const expected = calculateExpectedBalance(orders, pos.marketId, pos.position);
					
					// Skip if expected balance is 0 or negative (fully sold)
					if (expected <= 0) {
						continue;
					}

					try {
						const actualRaw = await ctfContract.balanceOf(wallet, pos.tokenId);
						const actual = parseFloat(formatUnits(actualRaw, 6));
						
						// Allow small tolerance for rounding
						const difference = Math.abs(actual - expected);
						if (difference > 0.01) {
							mismatchDetails.push({
								marketId: pos.marketId,
								tokenId: pos.tokenId,
								position: pos.position,
								expected,
								actual,
								difference,
							});
						}
					} catch (rpcErr) {
						console.error(`RPC error checking ${pos.tokenId}:`, rpcErr);
					}
				}

				newResults.set(profile._id, {
					profileId: profile._id,
					wallet,
					username: profile.username || null,
					isHealthy: mismatchDetails.length === 0,
					totalExpectedPositions: totalChecked,
					totalMismatches: mismatchDetails.length,
					mismatchDetails,
					checkedAt: new Date(),
				});

			} catch (err) {
				console.error(`Error checking profile ${profile._id}:`, err);
				newResults.set(profile._id, {
					profileId: profile._id,
					wallet,
					username: profile.username || null,
					isHealthy: false,
					totalExpectedPositions: 0,
					totalMismatches: 0,
					mismatchDetails: [],
					checkedAt: new Date(),
					error: err instanceof Error ? err.message : "Unknown error",
				});
			}

			// Small delay between accounts to avoid rate limiting
			await new Promise((r) => setTimeout(r, 100));
		}

		setResults(newResults);
		setLastCheckTime(new Date());
		setIsChecking(false);
		onHealthResults(newResults);
	}, [profiles, accessToken, onHealthResults]);

	// Calculate summary stats
	const healthyCount = Array.from(results.values()).filter((r) => r.isHealthy && !r.error).length;
	const problemCount = Array.from(results.values()).filter((r) => !r.isHealthy || r.error).length;
	const totalMismatches = Array.from(results.values()).reduce((sum, r) => sum + r.totalMismatches, 0);

	return (
		<div
			style={{
				background: "#1a1a1a",
				border: "1px solid #333",
				borderRadius: 8,
				padding: 16,
				marginBottom: 24,
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 16,
				}}
			>
				<div>
					<h3 style={{ margin: 0, marginBottom: 4 }}>🏥 Account Health Checker</h3>
					<p style={{ margin: 0, color: "#888", fontSize: 13 }}>
						Compares expected share balances (from orders) vs actual RPC balances
					</p>
				</div>
				<button
					type="button"
					onClick={runHealthCheck}
					disabled={isChecking || profiles.length === 0}
					style={{
						padding: "10px 20px",
						background: isChecking ? "#333" : "#22c55e",
						border: "none",
						borderRadius: 6,
						color: "white",
						fontWeight: 600,
						cursor: isChecking ? "wait" : "pointer",
						fontSize: 14,
					}}
				>
					{isChecking
						? `Checking... (${progress.current}/${progress.total})`
						: "Check Accounts Health"}
				</button>
			</div>

			{/* Progress bar */}
			{isChecking && (
				<div
					style={{
						background: "#222",
						borderRadius: 4,
						height: 8,
						marginBottom: 16,
						overflow: "hidden",
					}}
				>
					<div
						style={{
							background: "#22c55e",
							height: "100%",
							width: `${(progress.current / progress.total) * 100}%`,
							transition: "width 0.3s ease",
						}}
					/>
				</div>
			)}

			{/* Results summary */}
			{results.size > 0 && (
				<div
					style={{
						display: "flex",
						gap: 24,
						padding: 12,
						background: problemCount > 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
						borderRadius: 6,
						alignItems: "center",
						flexWrap: "wrap",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span style={{ fontSize: 24 }}>{problemCount > 0 ? "⚠️" : "✅"}</span>
						<div>
							<div style={{ fontWeight: 600, color: problemCount > 0 ? "#ef4444" : "#22c55e" }}>
								{problemCount > 0
									? `${problemCount} account${problemCount > 1 ? "s" : ""} with issues`
									: "All accounts healthy"}
							</div>
							<div style={{ fontSize: 12, color: "#888" }}>
								{healthyCount} healthy, {problemCount} with problems
							</div>
						</div>
					</div>

					{totalMismatches > 0 && (
						<div style={{ color: "#ef4444" }}>
							<strong>{totalMismatches}</strong> total balance mismatches
						</div>
					)}

					{lastCheckTime && (
						<div style={{ color: "#666", fontSize: 12, marginLeft: "auto" }}>
							Last checked: {lastCheckTime.toLocaleTimeString()}
						</div>
					)}
				</div>
			)}

			{/* Detailed problem accounts */}
			{results.size > 0 && problemCount > 0 && (
				<div style={{ marginTop: 16 }}>
					<h4 style={{ margin: "0 0 12px", color: "#ef4444" }}>Problem Accounts</h4>
					<div style={{ maxHeight: 300, overflowY: "auto" }}>
						{Array.from(results.values())
							.filter((r) => !r.isHealthy || r.error)
							.map((result) => (
								<div
									key={result.profileId}
									style={{
										background: "#222",
										padding: 12,
										borderRadius: 6,
										marginBottom: 8,
										border: "1px solid #333",
									}}
								>
									<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
										<div>
											<strong>{result.username || "Unknown"}</strong>
											<div style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>
												{result.wallet}
											</div>
										</div>
										<span
											style={{
												color: "#ef4444",
												fontWeight: 600,
											}}
										>
											{result.error ? "Error" : `${result.totalMismatches} mismatches`}
										</span>
									</div>

									{result.error && (
										<div style={{ color: "#ef4444", fontSize: 12 }}>{result.error}</div>
									)}

									{result.mismatchDetails.length > 0 && (
										<div style={{ fontSize: 12 }}>
											{result.mismatchDetails.map((m, i) => (
												<div
													key={i}
													style={{
														padding: "4px 8px",
														background: "#1a1a1a",
														borderRadius: 4,
														marginTop: 4,
														display: "flex",
														justifyContent: "space-between",
													}}
												>
													<span style={{ color: m.position === "Yes" ? "#22c55e" : "#ef4444" }}>
														{m.position}
													</span>
													<span>
														Expected: <strong>{m.expected.toFixed(2)}</strong> | 
														Actual: <strong>{m.actual.toFixed(2)}</strong> | 
														Diff: <strong style={{ color: "#fbbf24" }}>{m.difference.toFixed(2)}</strong>
													</span>
												</div>
											))}
										</div>
									)}
								</div>
							))}
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * Small inline indicator for health status
 */
export function HealthStatusIndicator({
	result,
	size = 18,
}: {
	result: AccountHealthResult | null;
	size?: number;
}) {
	if (!result) {
		return (
			<span
				title="Not checked yet"
				style={{
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					width: size,
					height: size,
					borderRadius: "50%",
					background: "#333",
					color: "#666",
					fontSize: size * 0.6,
				}}
			>
				?
			</span>
		);
	}

	if (result.error) {
		return (
			<span
				title={`Error: ${result.error}`}
				style={{
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					width: size,
					height: size,
					borderRadius: "50%",
					background: "rgba(251, 191, 36, 0.2)",
					color: "#fbbf24",
					fontSize: size * 0.7,
					fontWeight: 700,
				}}
			>
				!
			</span>
		);
	}

	if (result.isHealthy) {
		return (
			<span
				title={`Healthy - ${result.totalExpectedPositions} positions checked`}
				style={{
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					width: size,
					height: size,
					borderRadius: "50%",
					background: "rgba(34, 197, 94, 0.2)",
					color: "#22c55e",
					fontSize: size * 0.7,
					fontWeight: 700,
				}}
			>
				✓
			</span>
		);
	}

	return (
		<span
			title={`${result.totalMismatches} balance mismatches found`}
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				borderRadius: "50%",
				background: "rgba(239, 68, 68, 0.2)",
				color: "#ef4444",
				fontSize: size * 0.7,
				fontWeight: 700,
			}}
		>
			✗
		</span>
	);
}



