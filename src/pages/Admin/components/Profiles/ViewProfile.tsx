import { useEffect, useState, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { usePredictionData } from "@/context/PredictionDataContext";
import {
	adminErrorMessage,
	formatAdminErrorForUser,
	formatAdminHttpError,
	ADMIN_MISSING_ACCESS_TOKEN,
	ADMIN_PROFILE_INVALID,
} from "@/errors";

interface Order {
	_id: string;
	orderId: string;
	questionId: string;
	tokenId?: string;
	umbrellaId?: string;
	umbrellaDisplayName?: string;
	questionDisplayName?: string;
	side: "buy" | "sell";
	position?: "Yes" | "No";
	price?: number;
	size?: number;
	filled: boolean;
	filledAt?: string | null;
	createdAt: string;
	maker: string;
	makerAmount?: string;
	takerAmount?: string;
	usdcTotalMicro?: number;
	tokenTotalMicro?: number;
	marketType?: "market" | "limit";
}

interface ProfileData {
	_id: string;
	userId: string;
	username?: string;
	exp?: number;
	createdAt?: string;
	linked_accounts?: Array<{
		type: string;
		address?: string;
	}>;
	orders?: Order[];
	// Direct wallet properties (may exist alongside linked_accounts)
	smart_wallet?: string;
	wallet?: string;
}

interface ProfileApiResponse {
	success: boolean;
	data: {
		profile: ProfileData;
		orders: Order[];
	};
	error?: string;
}

interface ViewProfileProps {
	profileId: string;
	onBack: () => void;
}

/**
 * Get smart wallet address from profile, checking multiple sources
 */
function getSmartWalletAddress(profile: ProfileData | null): string | null {
	if (!profile) return null;

	// First try linked_accounts
	const linkedSmartWallet = profile.linked_accounts?.find((acc) => acc.type === "smart_wallet");
	if (linkedSmartWallet?.address) {
		return linkedSmartWallet.address;
	}

	// Then try direct smart_wallet property
	if (profile.smart_wallet) {
		return profile.smart_wallet;
	}

	// Fallback to wallet property
	if (profile.wallet) {
		return profile.wallet;
	}

	return null;
}

export default function ViewProfile({ profileId, onBack }: ViewProfileProps) {
	const { getAccessToken } = usePrivy();
	const { umbrellas, getAllQuestionsForUmbrella } = usePredictionData();
	const [profile, setProfile] = useState<ProfileData | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		async function fetchProfile() {
			setLoading(true);
			setError(null);
			try {
				const token = typeof getAccessToken === "function" ? await getAccessToken() : undefined;
				if (!token) {
					throw new Error(adminErrorMessage(ADMIN_MISSING_ACCESS_TOKEN));
				}
				const base = getPredictionApiBaseUrl();
				const resp = await fetch(`${base}/admin/profiles/${profileId}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const json = (await resp.json().catch(() => ({}) as any)) as ProfileApiResponse;
				if (!resp.ok) {
					throw new Error(formatAdminHttpError(resp.status, json?.error));
				}
				if (typeof json.success === "undefined") {
					throw new Error(adminErrorMessage(ADMIN_PROFILE_INVALID));
				}
				if (mounted) {
					console.log("🔍 ViewProfile: Profile data received:", json.data);

					// The response has profile and orders as separate properties
					const responseData = json.data || {};
					const profileData = responseData.profile || {};
					const orders = responseData.orders || [];

					// Combine profile data with orders
					const combinedProfile = {
						...profileData,
						orders: orders,
					};

					console.log("🔍 ViewProfile: Profile _id:", combinedProfile._id);
					console.log("🔍 ViewProfile: Profile userId:", combinedProfile.userId);
					console.log("🔍 ViewProfile: Profile exp:", combinedProfile.exp);
					console.log("🔍 ViewProfile: Profile username:", combinedProfile.username);
					console.log("🔍 ViewProfile: Profile orders count:", combinedProfile.orders?.length);

					setProfile(combinedProfile);
				}
			} catch (err: any) {
				console.error("error", err);
				if (mounted) setError(formatAdminErrorForUser(err));
			} finally {
				if (mounted) setLoading(false);
			}
		}
		fetchProfile();
		return () => {
			mounted = false;
		};
	}, [getAccessToken, profileId]);

	// Build a map of question _id to umbrella and token info
	const questionToUmbrellaMap = useMemo(() => {
		const map = new Map<
			string,
			{
				umbrellaId: string;
				umbrellaName: string;
				questionName: string;
				yesTokenId: string;
				noTokenId: string;
			}
		>();

		umbrellas.forEach((umbrella) => {
			const questions = getAllQuestionsForUmbrella(umbrella._id);
			questions.forEach((question: any) => {
				// Use _id (MongoDB id) as the key, not questionId
				const questionMongoId = question._id;
				if (questionMongoId && question.yesTokenId && question.noTokenId) {
					map.set(questionMongoId, {
						umbrellaId: umbrella._id,
						umbrellaName: umbrella.displayName,
						questionName: question.displayName || question.question || umbrella.displayName,
						yesTokenId: String(question.yesTokenId),
						noTokenId: String(question.noTokenId),
					});
				}
			});
		});

		console.log("🔍 ViewProfile: Question to umbrella map size:", map.size);
		return map;
	}, [umbrellas, getAllQuestionsForUmbrella]);

	// Determine position and umbrella for each order
	const ordersWithPosition = useMemo(() => {
		if (!profile?.orders) return [];

		return profile.orders.map((order) => {
			// Need tokenId and questionId to determine position
			if (!order.tokenId || !order.questionId) {
				return order;
			}

			// Find the umbrella and question info using questionId (which is the MongoDB _id)
			const umbrellaInfo = questionToUmbrellaMap.get(order.questionId);

			if (umbrellaInfo) {
				console.log(
					`✅ Found umbrella for questionId ${order.questionId}:`,
					umbrellaInfo.umbrellaName,
				);

				// Determine position by comparing tokenId
				let position = order.position;
				if (!position) {
					const orderTokenIdStr = String(order.tokenId);
					if (orderTokenIdStr === umbrellaInfo.yesTokenId) {
						position = "Yes";
					} else if (orderTokenIdStr === umbrellaInfo.noTokenId) {
						position = "No";
					}
				}

				return {
					...order,
					position: position || order.position,
					umbrellaId: umbrellaInfo.umbrellaId,
					umbrellaDisplayName: umbrellaInfo.umbrellaName,
					questionDisplayName: umbrellaInfo.questionName,
				};
			} else {
				console.log(`❌ Could not find umbrella for questionId: ${order.questionId}`);
				return order;
			}
		});
	}, [profile?.orders, questionToUmbrellaMap]);

	// Group orders by umbrella
	const ordersByUmbrella = ordersWithPosition.reduce(
		(acc, order) => {
			const umbrellaId = order.umbrellaId || "unknown";
			const umbrellaName = order.umbrellaDisplayName || `Umbrella ${umbrellaId}`;
			if (!acc[umbrellaId]) {
				acc[umbrellaId] = {
					umbrellaId,
					umbrellaName,
					orders: [],
				};
			}
			acc[umbrellaId].orders.push(order);
			return acc;
		},
		{} as Record<string, { umbrellaId: string; umbrellaName: string; orders: Order[] }>,
	);

	const umbrellaGroups = ordersByUmbrella ? Object.values(ordersByUmbrella) : [];

	if (loading) {
		return <div style={{ padding: 24, color: "white" }}>Loading profile...</div>;
	}

	if (error) {
		return (
			<div style={{ padding: 24, color: "white" }}>
				<div style={{ color: "#f87171", marginBottom: 16 }}>Error: {error}</div>
				<button
					type="button"
					onClick={onBack}
					style={{
						padding: "8px 16px",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
						color: "white",
						cursor: "pointer",
					}}
				>
					Back to List
				</button>
			</div>
		);
	}

	if (!profile) {
		return (
			<div style={{ padding: 24, color: "white" }}>
				<div style={{ marginBottom: 16 }}>Profile not found.</div>
				<button
					type="button"
					onClick={onBack}
					style={{
						padding: "8px 16px",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
						color: "white",
						cursor: "pointer",
					}}
				>
					Back to List
				</button>
			</div>
		);
	}

	return (
		<div style={{ padding: 24, color: "white" }}>
			<div
				style={{
					marginBottom: 24,
					display: "flex",
					alignItems: "center",
					gap: 16,
				}}
			>
				<button
					type="button"
					onClick={onBack}
					style={{
						padding: "8px 16px",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
						color: "white",
						cursor: "pointer",
					}}
				>
					← Back
				</button>
				<h2 style={{ margin: 0 }}>Profile Details</h2>
				{(() => {
					const smartWallet = getSmartWalletAddress(profile);
					if (!smartWallet) return null;
					return (
						<button
							type="button"
							onClick={() => {
								// Use the global spoofAccount function (same as console command)
								(window as any).spoofAccount(smartWallet);
								// Navigate to positions page with full reload
								window.location.assign("/positions");
							}}
							style={{
								padding: "8px 16px",
								border: "1px solid #22c55e",
								borderRadius: 6,
								background: "rgba(34, 197, 94, 0.2)",
								color: "#22c55e",
								cursor: "pointer",
								marginLeft: "auto",
								fontWeight: 500,
							}}
						>
							👤 View as User
						</button>
					);
				})()}
			</div>

			<div
				style={{
					marginBottom: 32,
					padding: 16,
					backgroundColor: "#1a1a1a",
					borderRadius: 8,
				}}
			>
				<div style={{ marginBottom: 8 }}>
					<strong>Profile ID:</strong> {profile._id || "N/A"}
				</div>
				<div style={{ marginBottom: 8 }}>
					<strong>Username:</strong> {profile.username || "N/A"}
				</div>
				{profile.userId && (
					<div style={{ marginBottom: 8 }}>
						<strong>User ID:</strong> {profile.userId}
					</div>
				)}
				{(() => {
					const smartWallet = getSmartWalletAddress(profile);
					if (!smartWallet) return null;
					return (
						<div style={{ marginBottom: 8 }}>
							<strong>Smart Wallet:</strong>{" "}
							<span style={{ fontFamily: "monospace", fontSize: "13px" }}>{smartWallet}</span>
						</div>
					);
				})()}
				{profile.linked_accounts?.find((acc) => acc.type === "email")?.address && (
					<div style={{ marginBottom: 8 }}>
						<strong>Email:</strong>{" "}
						{profile.linked_accounts.find((acc) => acc.type === "email")?.address}
					</div>
				)}
				<div style={{ marginBottom: 8 }}>
					<strong>EXP:</strong> {profile.exp ?? 0}
				</div>
				{profile.createdAt && (
					<div>
						<strong>Created:</strong> {new Date(profile.createdAt).toLocaleString()}
					</div>
				)}
			</div>

			<h3 style={{ marginBottom: 16 }}>Orders ({profile.orders?.length || 0})</h3>

			{umbrellaGroups.length === 0 ? (
				<div
					style={{
						padding: 16,
						backgroundColor: "#1a1a1a",
						borderRadius: 8,
					}}
				>
					No orders found.
				</div>
			) : (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 24,
					}}
				>
					{umbrellaGroups.map((group) => (
						<div
							key={group.umbrellaId}
							style={{
								padding: 16,
								backgroundColor: "#1a1a1a",
								borderRadius: 8,
							}}
						>
							<h4 style={{ marginTop: 0, marginBottom: 16 }}>
								{group.umbrellaName} ({group.orders.length} orders)
							</h4>
							<div style={{ overflowX: "auto" }}>
								<table
									style={{
										width: "100%",
										borderCollapse: "collapse",
										minWidth: "800px",
									}}
								>
									<thead>
										<tr
											style={{
												borderBottom: "1px solid #333",
											}}
										>
											<th
												style={{
													padding: "8px",
													textAlign: "left",
													color: "#aaa",
												}}
											>
												Market
											</th>
											<th
												style={{
													padding: "8px",
													textAlign: "left",
													color: "#aaa",
												}}
											>
												Type
											</th>
											<th
												style={{
													padding: "8px",
													textAlign: "left",
													color: "#aaa",
												}}
											>
												Side
											</th>
											<th
												style={{
													padding: "8px",
													textAlign: "left",
													color: "#aaa",
												}}
											>
												Position
											</th>
											<th
												style={{
													padding: "8px",
													textAlign: "left",
													color: "#aaa",
												}}
											>
												Price
											</th>
											<th
												style={{
													padding: "8px",
													textAlign: "left",
													color: "#aaa",
												}}
											>
												Trade Value (USDC)
											</th>
											<th
												style={{
													padding: "8px",
													textAlign: "left",
													color: "#aaa",
												}}
											>
												Status
											</th>
											<th
												style={{
													padding: "8px",
													textAlign: "left",
													color: "#aaa",
												}}
											>
												Created
											</th>
										</tr>
									</thead>
									<tbody>
										{group.orders.map((order) => (
											<tr
												key={order._id || order.orderId}
												style={{
													borderBottom: "1px solid #222",
												}}
											>
												<td
													style={{
														padding: "8px",
														fontSize: "13px",
														maxWidth: "200px",
													}}
												>
													{order.questionDisplayName || order.umbrellaDisplayName || "--"}
												</td>
												<td style={{ padding: "8px" }}>
													<span
														style={{
															padding: "4px 8px",
															borderRadius: 4,
															backgroundColor:
																order.marketType === "market"
																	? "rgba(59, 130, 246, 0.2)"
																	: "rgba(168, 85, 247, 0.2)",
															color: order.marketType === "market" ? "#3b82f6" : "#a855f7",
														}}
													>
														{(order.marketType || "market").toUpperCase()}
													</span>
												</td>
												<td style={{ padding: "8px" }}>
													<span
														style={{
															padding: "4px 8px",
															borderRadius: 4,
															backgroundColor:
																order.side === "buy"
																	? "rgba(34, 197, 94, 0.2)"
																	: "rgba(239, 68, 68, 0.2)",
															color: order.side === "buy" ? "#22c55e" : "#ef4444",
														}}
													>
														{order.side.toUpperCase()}
													</span>
												</td>
												<td style={{ padding: "8px" }}>{order.position || "--"}</td>
												<td style={{ padding: "8px" }}>
													{order.price ? `$${order.price.toFixed(2)}` : "--"}
												</td>
												<td style={{ padding: "8px" }}>
													{order.usdcTotalMicro !== undefined
														? `$${(order.usdcTotalMicro / 1000000).toFixed(2)}`
														: "--"}
												</td>
												<td style={{ padding: "8px" }}>
													<span
														style={{
															padding: "4px 8px",
															borderRadius: 4,
															backgroundColor: order.filled
																? "rgba(34, 197, 94, 0.2)"
																: "rgba(156, 163, 175, 0.2)",
															color: order.filled ? "#22c55e" : "#9ca3af",
														}}
													>
														{order.filled ? "Filled" : "Open"}
													</span>
												</td>
												<td
													style={{
														padding: "8px",
														fontSize: "12px",
													}}
												>
													{order.createdAt ? new Date(order.createdAt).toLocaleString() : "--"}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
