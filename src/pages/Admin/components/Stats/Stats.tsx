import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import {
	adminErrorMessage,
	formatAdminErrorForUser,
	formatAdminHttpError,
	ADMIN_MISSING_ACCESS_TOKEN,
	ADMIN_STATS_EMPTY,
	ADMIN_STATS_INVALID,
} from "@/errors";

interface StatsData {
	profilesCreated: {
		day: number;
		week: number;
	};
	marketOrders: {
		day: number;
		week: number;
	};
	limitOrders: {
		day: number;
		week: number;
	};
	totalVolume?: {
		day: number;
		week: number;
	};
	activeUsers?: {
		day: number;
		week: number;
	};
}

interface StatsApiResponse {
	success: boolean;
	data: StatsData;
	error?: string;
}

export default function Stats() {
	const { getAccessToken } = usePrivy();
	const [stats, setStats] = useState<StatsData | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		async function fetchStats() {
			setLoading(true);
			setError(null);
			try {
				const token = typeof getAccessToken === "function" ? await getAccessToken() : undefined;
				if (!token) {
					throw new Error(adminErrorMessage(ADMIN_MISSING_ACCESS_TOKEN));
				}
				const base = getPredictionApiBaseUrl();
				const resp = await fetch(`${base}/admin/stats`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const json = (await resp.json().catch(() => ({}) as any)) as StatsApiResponse;
				if (!resp.ok) {
					throw new Error(formatAdminHttpError(resp.status, json?.error));
				}
				if (typeof json.success === "undefined") {
					throw new Error(adminErrorMessage(ADMIN_STATS_INVALID));
				}
				if (!json.data) {
					throw new Error(adminErrorMessage(ADMIN_STATS_EMPTY));
				}
				if (mounted) {
					setStats(json.data);
				}
			} catch (err: unknown) {
				console.error("error", err);
				if (mounted) setError(formatAdminErrorForUser(err));
			} finally {
				if (mounted) setLoading(false);
			}
		}
		fetchStats();
		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

	if (loading) {
		return <div style={{ padding: 24, color: "white" }}>Loading stats...</div>;
	}

	if (error) {
		return (
			<div style={{ padding: 24, color: "white" }}>
				<div style={{ color: "#f87171", marginBottom: 16 }}>Error: {error}</div>
			</div>
		);
	}

	if (!stats) {
		return <div style={{ padding: 24, color: "white" }}>No stats available.</div>;
	}

	return (
		<div style={{ padding: 24, color: "white" }}>
			<h2 style={{ marginBottom: 24 }}>Statistics</h2>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
					gap: 24,
				}}
			>
				{/* Profiles Created */}
				<div
					style={{
						padding: 20,
						backgroundColor: "#1a1a1a",
						borderRadius: 8,
					}}
				>
					<h3 style={{ marginTop: 0, marginBottom: 16 }}>Profiles Created</h3>
					<div style={{ marginBottom: 8 }}>
						<strong>Last 24 hours:</strong> {stats.profilesCreated.day}
					</div>
					<div>
						<strong>Last 7 days:</strong> {stats.profilesCreated.week}
					</div>
				</div>

				{/* Market Orders */}
				<div
					style={{
						padding: 20,
						backgroundColor: "#1a1a1a",
						borderRadius: 8,
					}}
				>
					<h3 style={{ marginTop: 0, marginBottom: 16 }}>Market Orders</h3>
					<div style={{ marginBottom: 8 }}>
						<strong>Last 24 hours:</strong> {stats.marketOrders.day}
					</div>
					<div>
						<strong>Last 7 days:</strong> {stats.marketOrders.week}
					</div>
				</div>

				{/* Limit Orders */}
				<div
					style={{
						padding: 20,
						backgroundColor: "#1a1a1a",
						borderRadius: 8,
					}}
				>
					<h3 style={{ marginTop: 0, marginBottom: 16 }}>Limit Orders</h3>
					<div style={{ fontSize: "12px", color: "#aaa", marginBottom: 8 }}>
						(excluding test wallet)
					</div>
					<div style={{ marginBottom: 8 }}>
						<strong>Last 24 hours:</strong> {stats.limitOrders.day}
					</div>
					<div>
						<strong>Last 7 days:</strong> {stats.limitOrders.week}
					</div>
				</div>

				{/* Total Volume (if available) */}
				{stats.totalVolume && (
					<div
						style={{
							padding: 20,
							backgroundColor: "#1a1a1a",
							borderRadius: 8,
						}}
					>
						<h3 style={{ marginTop: 0, marginBottom: 16 }}>Total Volume (USDC)</h3>
						<div style={{ marginBottom: 8 }}>
							<strong>Last 24 hours:</strong> $
							{stats.totalVolume.day.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2,
							})}
						</div>
						<div>
							<strong>Last 7 days:</strong> $
							{stats.totalVolume.week.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2,
							})}
						</div>
					</div>
				)}

				{/* Active Users (if available) */}
				{stats.activeUsers && (
					<div
						style={{
							padding: 20,
							backgroundColor: "#1a1a1a",
							borderRadius: 8,
						}}
					>
						<h3 style={{ marginTop: 0, marginBottom: 16 }}>Active Users</h3>
						<div style={{ marginBottom: 8 }}>
							<strong>Last 24 hours:</strong> {stats.activeUsers.day}
						</div>
						<div>
							<strong>Last 7 days:</strong> {stats.activeUsers.week}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
