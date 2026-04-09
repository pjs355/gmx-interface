import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenueOrder } from "@/types/trading/venuePosition";
import { cancelOrder } from "@/services/api/simplifiedOrderService";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import gtaIcon from "@/assets/img/ic_gtaVI_24.jpg";
import {
	resolveLogoByTags,
	resolveUmbrellaIconById,
	getTagImageFromUmbrella,
	getTagLabelsFromUmbrella,
} from "@/helpers/gameLogoResolver";
import { usePredictionData } from "@/context/PredictionDataContext";

// Component to handle image with proper fallback
function UmbrellaImage({ umbrella }: { umbrella: any }) {
	const { tags } = usePredictionData();
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;
	const tagImage = getTagImageFromUmbrella(umbrella, tags);
	const tagLabels = getTagLabelsFromUmbrella(umbrella, tags);
	const gameLogo = resolveLogoByTags(tagLabels);
	const fallbackLogo = gameLogo || gtaIcon;
	const initialSrc = serverImage || tagImage || fallbackLogo;

	const handleError = () => {
		if (!imageError) {
			setImageError(true);
			if (currentSrc !== tagImage && tagImage) {
				setCurrentSrc(tagImage);
			} else if (currentSrc !== gameLogo && gameLogo) {
				setCurrentSrc(gameLogo);
			} else {
				setCurrentSrc(gtaIcon);
			}
		}
	};

	return (
		<img
			src={currentSrc || initialSrc}
			alt="umbrella"
			width={40}
			height={40}
			style={{
				display: "block",
				background: "#000",
				borderRadius: 8,
				objectFit: "contain",
			}}
			onError={handleError}
		/>
	);
}

export default function OrdersCardView({
	umbrellaBalances,
	orders,
	venueOrders = [],
}: {
	umbrellaBalances: any[];
	orders: ProcessedOrder[];
	venueOrders?: VenueOrder[];
}) {
	const navigate = useNavigate();
	const privateApi = usePrivateApiClient();

	const navigateToTradingPage = (
		umbrella: Umbrella,
		market: PredictionMarket,
		position: "yes" | "no"
	) => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		localStorage.setItem("currentPredictionMarket", JSON.stringify(market));
		localStorage.setItem("activePosition", position);

		const marketId = market._id || market.questionId || market.marketId;
		if (marketId) {
			localStorage.setItem("selectedMarketId", marketId);
		}

		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const ordersByMarket = useMemo(() => {
		const unfilledOrders = orders.filter(
			(order) => !order.filled && Number(order.size) > 0
		);
		const grouped: Record<string, ProcessedOrder[]> = {};

		unfilledOrders.forEach((order) => {
			const questionId = order.questionId;
			if (!grouped[questionId]) {
				grouped[questionId] = [];
			}
			grouped[questionId].push(order);
		});

		return grouped;
	}, [orders]);

	const [cancelingIds, setCancelingIds] = useState<Set<string>>(new Set());
	const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
	const [tick, setTick] = useState(0);

	useEffect(() => {
		const id = setInterval(() => setTick((t) => (t + 1) % 3), 500);
		return () => clearInterval(id);
	}, []);

	return (
		<div className="flex flex-col gap-12">
			{umbrellaBalances.map(({ umbrella, markets }) => {
				const marketsWithOrders = markets.filter(({ market }: any) => {
					const qid =
						market._id || market.questionId || market.marketId;
					return (
						qid &&
						Array.isArray(ordersByMarket[qid]) &&
						ordersByMarket[qid].length > 0
					);
				});
				if (marketsWithOrders.length === 0) return null;

				return (
					<div key={umbrella._id} className="umbrella-card">
						{marketsWithOrders.map(({ market }: any) => {
							const qid =
								market._id ||
								market.questionId ||
								market.marketId;
							const list = (ordersByMarket[qid] || []).filter(
								(o) => !removedIds.has(o.orderId)
							);

							return list.map((o) => {
								const title = (
									market?.displayName ||
									(market as any)?.question ||
									""
								).trim();
								const parts = title
									.split(/\s*vs\.?\s*/i)
									.map((s: string) => s.trim())
									.filter(Boolean);
								const isVs = parts.length === 2;

								return (
									<div
										key={`${umbrella._id}-${qid}-${o.orderId}`}
										style={{
											background: "#1a1a1a",
											border: "1px solid #2a2a2a",
											borderRadius: 12,
											overflow: "hidden",
											marginBottom: 12,
										}}
									>
									{/* Card Header */}
									<div
										onClick={() =>
											navigateToTradingPage(
												umbrella,
												market,
												o.position.toLowerCase() as "yes" | "no"
											)
										}
										style={{
											padding: "16px",
											background: "#0a0a0a",
											borderBottom:
												"1px solid #2a2a2a",
											display: "flex",
											alignItems: "center",
											gap: 12,
											cursor: "pointer",
										}}
									>
											<UmbrellaImage
												umbrella={umbrella}
											/>
											<div style={{ flex: 1 }}>
												<div
													style={{
														color: "#888",
														fontSize: 11,
														textTransform:
															"uppercase",
														letterSpacing: 0.6,
														marginBottom: 4,
													}}
												>
													{umbrella.displayName}
												</div>
												<div
													style={{
														color: "#fff",
														fontSize: 16,
														fontWeight: 600,
													}}
												>
													{isVs ? (
														<>
															<span>
																{o.position ===
																"Yes"
																	? parts[0]
																	: parts[1]}
															</span>{" "}
															<span
																style={{
																	color:
																		o.side ===
																		"buy"
																			? "#16a34a"
																			: "#ef4444",
																}}
															>
																{o.side ===
																"buy"
																	? "Buy"
																	: "Sell"}
															</span>
														</>
													) : (
														<>
															{market.displayName ||
																market.question}{" "}
															{o.position ===
																"Yes" && (
																<span
																	style={{
																		color: "#16a34a",
																	}}
																>
																	Yes
																</span>
															)}
															{o.position ===
																"No" && (
																<span
																	style={{
																		color: "#ef4444",
																	}}
																>
																	No
																</span>
															)}{" "}
															<span
																style={{
																	color:
																		o.side ===
																		"buy"
																			? "#16a34a"
																			: "#ef4444",
																}}
															>
																{o.side ===
																"buy"
																	? "Buy"
																	: "Sell"}
															</span>
														</>
													)}
												</div>
											</div>
										</div>

										{/* Card Summary - Three Columns: Price, Shares, Cancel Button */}
										<div
											style={{
												padding: "16px",
												display: "flex",
												justifyContent: "space-between",
												alignItems: "center",
												gap: 12,
											}}
										>
											<div style={{ flex: 1 }}>
												<div
													style={{
														color: "#888",
														fontSize: 11,
														textTransform:
															"uppercase",
														letterSpacing: 0.6,
														marginBottom: 4,
													}}
												>
													Price
												</div>
												<div
													style={{
														color: "#fff",
														fontSize: 18,
														fontWeight: 700,
													}}
												>
													{o.price !== undefined
														? `${Math.round(
																(o.price || 0) *
																	100
														  )}¢`
														: "—"}
												</div>
											</div>
											<div
												style={{
													flex: 1,
													textAlign: "center",
												}}
											>
												<div
													style={{
														color: "#888",
														fontSize: 11,
														textTransform:
															"uppercase",
														letterSpacing: 0.6,
														marginBottom: 4,
													}}
												>
													Shares
												</div>
												<div
													style={{
														color: "#fff",
														fontSize: 18,
														fontWeight: 700,
													}}
												>
													{o.size !== undefined
														? Math.round(
																Number(o.size)
														  )
														: "—"}
												</div>
											</div>
											<div
												style={{
													flex: 1,
													display: "flex",
													justifyContent: "flex-end",
												}}
											>
												<button
													type="button"
													style={{
														background: "#ef4444",
														color: "#fff",
														border: "none",
														borderRadius: 6,
														padding: "8px 16px",
														cursor: cancelingIds.has(
															o.orderId
														)
															? "default"
															: "pointer",
														opacity:
															cancelingIds.has(
																o.orderId
															)
																? 0.7
																: 1,
														fontWeight: 600,
														fontSize: 13,
														whiteSpace: "nowrap",
													}}
													onClick={async (e) => {
														e.stopPropagation();
														if (
															cancelingIds.has(
																o.orderId
															)
														)
															return;
														setCancelingIds(
															(prev) =>
																new Set(
																	prev
																).add(o.orderId)
														);
														try {
															const res =
																await cancelOrder(
																	o.orderId
																);
															console.log(
																"Cancel order result:",
																res
															);
														} catch (e) {
															console.error(
																"Cancel order error:",
																e
															);
														} finally {
															setTimeout(() => {
																setRemovedIds(
																	(prev) =>
																		new Set(
																			prev
																		).add(
																			o.orderId
																		)
																);
																setCancelingIds(
																	(prev) => {
																		const ns =
																			new Set(
																				prev
																			);
																		ns.delete(
																			o.orderId
																		);
																		return ns;
																	}
																);
															}, 3000);
														}
													}}
												>
													{cancelingIds.has(o.orderId)
														? `Canceling${".".repeat(
																(tick % 3) + 1
														  )}`
														: "Cancel"}
												</button>
											</div>
										</div>
									</div>
								);
							});
						})}
					</div>
				);
			})}

		{/* Venue orders (Predict, etc.) */}
		{venueOrders.filter((vo) => !removedIds.has(vo.orderId)).map((vo) => (
			<div
				key={`venue-${vo.orderId}`}
				style={{
					background: "#1a1a1a",
					border: "1px solid #2a2a2a",
					borderRadius: 12,
					overflow: "hidden",
					marginBottom: 12,
				}}
			>
				<div
					style={{
						padding: "16px",
						background: "#0a0a0a",
						borderBottom: "1px solid #2a2a2a",
						display: "flex",
						alignItems: "center",
						gap: 12,
					}}
				>
					<div style={{ flex: 1 }}>
						<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
							{vo.venue === "predictfun" ? "Predict" : vo.venue}
						</div>
						<div style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>
							{vo.marketTitle}{" "}
							<span style={{ color: vo.position === "Yes" ? "#16a34a" : "#ef4444" }}>
								{vo.position}
							</span>{" "}
							<span style={{ color: vo.side === "buy" ? "#16a34a" : "#ef4444" }}>
								{vo.side === "buy" ? "Buy" : "Sell"}
							</span>
						</div>
					</div>
				</div>
				<div style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
					<div style={{ flex: 1 }}>
						<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Price</div>
						<div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>{`${Math.round(vo.price * 100)}¢`}</div>
					</div>
					<div style={{ flex: 1, textAlign: "center" }}>
						<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Shares</div>
						<div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>{Math.round(vo.size)}</div>
					</div>
					<div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
						<button
							type="button"
							style={{
								background: "#ef4444",
								color: "#fff",
								border: "none",
								borderRadius: 6,
								padding: "8px 16px",
								cursor: cancelingIds.has(vo.orderId) ? "default" : "pointer",
								opacity: cancelingIds.has(vo.orderId) ? 0.7 : 1,
								fontWeight: 600,
								fontSize: 13,
								whiteSpace: "nowrap",
							}}
							onClick={async (e) => {
								e.stopPropagation();
								if (cancelingIds.has(vo.orderId)) return;
								setCancelingIds((prev) => new Set(prev).add(vo.orderId));
								try {
									if (vo.venue === "predictfun" && vo.rawOrder) {
										await privateApi.removePredictOrders({ orders: [vo.rawOrder] });
									}
								} catch (err) {
									console.error("Cancel venue order error:", err);
								} finally {
									setTimeout(() => {
										setRemovedIds((prev) => new Set(prev).add(vo.orderId));
										setCancelingIds((prev) => {
											const ns = new Set(prev);
											ns.delete(vo.orderId);
											return ns;
										});
									}, 3000);
								}
							}}
						>
							{cancelingIds.has(vo.orderId) ? `Canceling${".".repeat((tick % 3) + 1)}` : "Cancel"}
						</button>
					</div>
				</div>
			</div>
		))}

		{Object.keys(ordersByMarket).length === 0 &&
			venueOrders.filter((vo) => !removedIds.has(vo.orderId)).length === 0 && (
				<div
					style={{
						textAlign: "center",
						padding: "40px",
						color: "#888",
					}}
				>
					<p>No open orders found</p>
				</div>
			)}
	</div>
	);
}
