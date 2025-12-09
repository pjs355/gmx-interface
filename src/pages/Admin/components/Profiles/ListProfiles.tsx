import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

interface ListProfilesProps {
	onView?: (profileId: string) => void;
}

interface Profile {
	_id: string;
	userId: string;
	username?: string;
	email?: string;
	exp?: number;
	createdAt?: string;
	updatedAt?: string;
	linked_accounts?: any[];
	tradingVolume?: number;
}

interface ProfilesApiResponse {
	success: boolean;
	data: Profile[];
	error?: string;
}

export default function ListProfiles({ onView }: ListProfilesProps) {
	const { getAccessToken } = usePrivy();
	const [profiles, setProfiles] = useState<Profile[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		async function fetchProfiles() {
			setLoading(true);
			setError(null);
			try {
				const token =
					typeof getAccessToken === "function"
						? await getAccessToken()
						: undefined;
				if (!token) {
					throw new Error("Missing admin access token");
				}
				const base = getPredictionApiBaseUrl();
				const resp = await fetch(`${base}/admin/profiles`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const json = (await resp
					.json()
					.catch(() => ({} as any))) as ProfilesApiResponse;
				if (!resp.ok) {
					throw new Error(
						json?.error || `HTTP ${resp.status}`
					);
				}
				if (typeof json.success === "undefined") {
					throw new Error("Invalid response for profiles list");
				}
				if (mounted) {
					if (Array.isArray(json.data)) {
						setProfiles(json.data);
					} else if (json.data) {
						setProfiles([json.data]);
					} else {
						setProfiles([]);
					}
				}
			} catch (err: any) {
				console.error("error", err);
				if (mounted) setError(err?.message || String(err));
			} finally {
				if (mounted) setLoading(false);
			}
		}
		fetchProfiles();
		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

	if (loading) {
		return (
			<div style={{ padding: 24, color: "white" }}>
				Loading profiles...
			</div>
		);
	}

	if (error) {
		return (
			<div style={{ padding: 24, color: "red" }}>
				Error: {error}
			</div>
		);
	}

	return (
		<div style={{ padding: 24, color: "white" }}>
			<h2 style={{ marginBottom: 24 }}>Profiles</h2>
			{profiles.length === 0 ? (
				<div>No profiles found.</div>
			) : (
				<table
					style={{
						width: "100%",
						borderCollapse: "collapse",
						backgroundColor: "#1a1a1a",
					}}
				>
					<thead>
						<tr style={{ borderBottom: "1px solid #333" }}>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Wallet Address
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Username
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Email
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Trading Volume
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								EXP
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Created
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{profiles.map((profile) => {
							const smartWallet = profile.linked_accounts?.find(
								(acc: any) => acc.type === "smart_wallet"
							);
							const walletAddress = smartWallet?.address || "--";
							const truncatedAddress = walletAddress !== "--" 
								? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
								: "--";
							
							return (
								<tr
									key={profile._id}
									style={{
										borderBottom: "1px solid #333",
									}}
								>
									<td style={{ padding: "12px", fontFamily: "monospace", fontSize: "13px" }}>
										{truncatedAddress}
									</td>
									<td style={{ padding: "12px" }}>
										{profile.username || "--"}
									</td>
									<td style={{ padding: "12px" }}>
										{profile.linked_accounts?.find(
											(acc: any) => acc.type === "email"
										)?.address || "--"}
									</td>
									<td style={{ padding: "12px" }}>
										{profile.tradingVolume !== undefined
											? `$${(profile.tradingVolume / 1000000).toFixed(2)}`
											: "--"}
									</td>
									<td style={{ padding: "12px" }}>
										{profile.exp ?? 0}
									</td>
									<td style={{ padding: "12px" }}>
										{profile.createdAt
											? new Date(
													profile.createdAt
											  ).toLocaleDateString()
											: "--"}
									</td>
									<td style={{ padding: "12px" }}>
										<button
											type="button"
											onClick={() => {
												if (onView) {
													onView(profile._id);
												}
											}}
											style={{
												padding: "6px 12px",
												border: "1px solid rgba(255, 255, 255, 0.3)",
												borderRadius: 4,
												background: "rgba(106, 111, 245, 0.2)",
												color: "white",
												cursor: "pointer",
												fontSize: "14px",
											}}
										>
											View
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}
		</div>
	);
}

