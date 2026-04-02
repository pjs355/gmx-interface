import React, { useState } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import gtaIcon from "@/assets/img/ic_gtaVI_24.svg";
import {
	resolveLogoByTags,
	resolveUmbrellaIconById,
	getTagImageFromUmbrella,
	getTagLabelsFromUmbrella,
} from "@/helpers/gameLogoResolver";
import { triggerFireworksForElement } from "../utils/Fireworks";
import { useClaimForVenue } from "@/helpers/claimEarnings";
import ScrollableTable from "@/components/ScrollableTable/ScrollableTable";
import { usePredictionData } from "@/context/PredictionDataContext";

// Component to handle image with proper fallback
function UmbrellaImage({ umbrella }: { umbrella: any }) {
	const { tags } = usePredictionData();
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	// Priority 1: Check for server image (ic_{umbrellaID})
	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;

	// Priority 2: Check for tag imageUrl from tags
	const tagImage = getTagImageFromUmbrella(umbrella, tags);

	// Priority 3: Check for game logo based on tag labels
	const tagLabels = getTagLabelsFromUmbrella(umbrella, tags);
	const gameLogo = resolveLogoByTags(tagLabels);

	// Priority 4: Fallback to game controller
	const fallbackLogo = gameLogo || gtaIcon;

	// Determine initial source
	const initialSrc = serverImage || tagImage || fallbackLogo;

	const handleError = () => {
		if (!imageError) {
			setImageError(true);
			// Try fallback order: tagImage → gameLogo → gtaIcon
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
			width={48}
			height={48}
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

export default function ResolvedPositionsTable({
	umbrellaBalances,
	toCentsString,
	softLoading = false,
	onClaimSuccess,
}: {
	umbrellaBalances: Array<{
		umbrella: Umbrella;
		markets: Array<{ market: PredictionMarket; yes: string; no: string }>;
	}>;
	toCentsString: (n?: number | null) => string;
	softLoading?: boolean;
	onClaimSuccess?: (marketId: string, umbrellaId: string) => void;
}) {
	const formatCurrency = (value?: number | null): string => {
		if (value === null || value === undefined || !isFinite(value))
			return "—";
		const isInt = Math.abs(value % 1) < 1e-9;
		const formatted = isInt 
			? value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
			: value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		return `$${formatted}`;
	};

	return (
		<div className="flex flex-col gap-8">
			<ScrollableTable minWidth="600px">
				<div
					className="positions-header grid items-center px-12 py-10"
					style={{
						gridTemplateColumns:
							"minmax(200px, 2fr) repeat(3, 1fr) 1fr",
						borderBottom: "1px solid #333333",
						color: "#888",
						fontSize: 12,
						textTransform: "uppercase",
						letterSpacing: 0.6,
					}}
				>
					<div>Market</div>
					<div style={{ textAlign: "center" }}>Shares</div>
					<div style={{ textAlign: "center" }}>Settlement Payout</div>
					<div style={{ textAlign: "center" }}>Total Payout</div>
					<div style={{ textAlign: "center" }}></div>
				</div>

				<div className="flex flex-col">
					{umbrellaBalances.map(({ umbrella, markets }) => (
						<div key={umbrella._id} className="umbrella-block">
							<div
								className="grid px-12 py-10"
								style={{
									gridTemplateColumns:
										"minmax(200px, 2fr) repeat(4, 1fr)",
									background: "#000000",
									borderBottom: "1px solid #1f1f1f",
									paddingTop: 16,
									paddingBottom: 16,
								}}
							>
								<div
									style={{
										gridColumn: "1 / -1",
										fontWeight: 700,
										color: "#dedede",
										fontSize: 20,
										display: "flex",
										alignItems: "center",
										gap: "12px",
									}}
								>
									<UmbrellaImage umbrella={umbrella} />
									{umbrella.displayName}
								</div>
							</div>

							{softLoading && markets.length === 0 && (
								<div
									className="grid items-center px-12 py-12 position-row"
									style={{
										gridTemplateColumns:
											"minmax(200px, 2fr) repeat(3, 1fr) 1fr",
										borderBottom: "1px solid #1f1f1f",
										fontSize: 16,
									}}
								>
									{Array.from({ length: 5 }).map((_, idx) => (
										<div
											key={idx}
											style={{
												textAlign:
													idx === 0
														? undefined
														: "center",
												color: "#fff",
											}}
										>
											<span
												className="skeleton-box"
												style={{
													display: "inline-block",
													width: idx === 0 ? 220 : 80,
													height: 16,
													borderRadius: 4,
												}}
											/>
										</div>
									))}
								</div>
							)}

							{markets.map(({ market, yes, no }) => {
								const title = (
									market?.displayName ||
									(market as any)?.question ||
									""
								).trim();
								const winningShares = (() => {
									const resolvedOutcome = String(
										(market as any).resolvedOutcome || ""
									).toLowerCase();
									if (resolvedOutcome === "yes")
										return Number(yes);
									if (resolvedOutcome === "no")
										return Number(no);
									return 0;
								})();
								const settlementPayout = 1; // $1 fixed per winning share
								const totalPayout =
									winningShares * settlementPayout;

								// Derive display name to mirror Positions table logic
								const resolvedOutcome = String(
									(market as any).resolvedOutcome || ""
								).toLowerCase();
								const winningSideLabel: "Yes" | "No" =
									resolvedOutcome === "yes" ? "Yes" : "No";
								const parts = title
									.split(/\s*vs\.?\s*/i)
									.map((s: string) => s.replace(/^[^:]+:\s*/, "").trim())
									.filter(Boolean);
								const isVs = parts.length === 2;
								const yesColor = "#16a34a";
								const noColor = "#ef4444";

								return (
									<div
										key={
											(market._id ||
												market.questionId ||
												market.marketId) as string
										}
										className="grid items-center px-12 py-12 position-row"
										style={{
											gridTemplateColumns:
												"minmax(200px, 2fr) repeat(3, 1fr) 1fr",
											borderBottom: "1px solid #1f1f1f",
											fontSize: 16,
										}}
									>
										<div
											style={{
												color: "#fff",
												fontWeight: 600,
											}}
										>
											{isVs ? (
												<span>
													{winningSideLabel === "Yes"
														? parts[0]
														: parts[1]}
												</span>
											) : (
												<>
													<span>{title} </span>
													<span
														style={{
															color:
																winningSideLabel ===
																"Yes"
																	? yesColor
																	: noColor,
														}}
													>
														{winningSideLabel}
													</span>
												</>
											)}
											<span style={{ marginLeft: 6, fontSize: 11, color: "#666", fontWeight: 400 }}>
												({(market as any)._venue === "polymarket"
													? "Polymarket"
													: (market as any)._venue === "predictfun"
														? "Predict.fun"
														: (market as any)._venue === "dflow"
															? "DFlow"
															: "LevelUp"})
											</span>
										</div>
										<div
											style={{
												textAlign: "center",
												color: "#fff",
											}}
										>
											<span
												className={
													softLoading
														? "soft-blur"
														: undefined
												}
											>
												{parseFloat(winningShares.toFixed(2))}
											</span>
										</div>
										<div
											style={{
												textAlign: "center",
												color: "#fff",
											}}
										>
											<span
												className={
													softLoading
														? "soft-blur"
														: undefined
												}
											>
												$1
											</span>
										</div>
										<div
											style={{
												textAlign: "center",
												color: "#16a34a",
												fontWeight: 700,
												fontSize: 20,
											}}
										>
											<span
												className={
													softLoading
														? "soft-blur"
														: undefined
												}
											>
												{formatCurrency(totalPayout)}
											</span>
										</div>
										<div style={{ textAlign: "center" }}>
											<ClaimButton
												market={market}
												resolvedOutcome={
													resolvedOutcome as
														| "yes"
														| "no"
												}
												onClaimSuccess={onClaimSuccess}
												umbrellaId={umbrella._id}
											/>
										</div>
									</div>
								);
							})}
						</div>
					))}
				</div>
			</ScrollableTable>
		</div>
	);
}

function ClaimButton({
	market,
	resolvedOutcome,
	onClaimSuccess,
	umbrellaId,
}: {
	market: PredictionMarket;
	resolvedOutcome: "yes" | "no";
	onClaimSuccess?: (marketId: string, umbrellaId: string) => void;
	umbrellaId: string;
}) {
	const btnRef = React.useRef<HTMLButtonElement | null>(null);
	const { claim, isClaiming, error } = useClaimForVenue(
		market,
		resolvedOutcome
	);

	const handleClick = async () => {
		if (isClaiming) return;

		if (btnRef.current) {
			triggerFireworksForElement(btnRef.current);
		}

		try {
			const success = await claim();

			if (success) {
				const marketId =
					market._id || market.questionId || market.marketId;
				if (onClaimSuccess && marketId) {
					onClaimSuccess(marketId, umbrellaId);
				}
			}
		} catch (err) {
			console.error("CLAIM ERROR:", err);
		}
	};

	const label = isClaiming ? "Claiming..." : "Claim";

	return (
		<button
			ref={btnRef}
			className="side-btn"
			disabled={isClaiming}
			style={{
				background: isClaiming ? "#6d28d9" : "#7c3aed",
				color: "#fff",
				border: "none",
				padding: "10px 16px",
				borderRadius: 6,
				fontWeight: 600,
				cursor: isClaiming ? "not-allowed" : "pointer",
				opacity: isClaiming ? 0.7 : 1,
				transition:
					"background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease, opacity 0.15s ease",
				boxShadow: isClaiming
					? "0 0 0 0 rgba(0,0,0,0)"
					: "0 4px 10px rgba(124, 58, 237, 0.35)",
			}}
			onMouseEnter={(e) => {
				if (!isClaiming)
					(e.currentTarget as HTMLButtonElement).style.background =
						"#8b5cf6";
			}}
			onMouseLeave={(e) => {
				if (!isClaiming)
					(e.currentTarget as HTMLButtonElement).style.background =
						"#7c3aed";
			}}
			onMouseDown={(e) => {
				if (!isClaiming)
					(e.currentTarget as HTMLButtonElement).style.transform =
						"translateY(1px)";
			}}
			onMouseUp={(e) => {
				(e.currentTarget as HTMLButtonElement).style.transform =
					"translateY(0)";
			}}
			onClick={handleClick}
			title={error ? `Error: ${error}` : undefined}
		>
			{label}
		</button>
	);
}
