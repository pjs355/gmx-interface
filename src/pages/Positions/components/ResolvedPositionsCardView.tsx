import React, { useState } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import gtaIcon from "@/assets/img/ic_gtaVI_24.svg";
import {
	resolveLogoWithPriority,
	collectTagsFromUmbrella,
	resolveUmbrellaIconById,
} from "@/helpers/gameLogoResolver";
import { triggerFireworksForElement } from "../utils/Fireworks";
import { useClaimEarningsForMarket } from "@/helpers/claimEarnings";

// Component to handle image with proper fallback
function UmbrellaImage({ umbrella }: { umbrella: any }) {
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;
	const gameLogo = resolveLogoWithPriority(
		umbrella,
		collectTagsFromUmbrella(umbrella)
	);
	const fallbackLogo = gameLogo || gtaIcon;
	const initialSrc = serverImage || fallbackLogo;

	const handleError = () => {
		if (!imageError && serverImage && gameLogo) {
			setImageError(true);
			setCurrentSrc(gameLogo);
		} else if (!imageError && serverImage && !gameLogo) {
			setImageError(true);
			setCurrentSrc(gtaIcon);
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

export default function ResolvedPositionsCardView({
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
		<div className="flex flex-col gap-12">
			{umbrellaBalances.map(({ umbrella, markets }) => (
				<div key={umbrella._id} className="umbrella-card">
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
						const totalPayout = winningShares * settlementPayout;

						// Derive display name
						const resolvedOutcome = String(
							(market as any).resolvedOutcome || ""
						).toLowerCase();
						const winningSideLabel: "Yes" | "No" =
							resolvedOutcome === "yes" ? "Yes" : "No";
						const parts = title
							.split(/\s*vs\.?\s*/i)
							.map((s: string) => s.trim())
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
									style={{
										padding: "16px",
										background: "#0a0a0a",
										borderBottom: "1px solid #2a2a2a",
										display: "flex",
										alignItems: "center",
										gap: 12,
									}}
								>
									<UmbrellaImage umbrella={umbrella} />
									<div style={{ flex: 1 }}>
										<div
											style={{
												color: "#888",
												fontSize: 11,
												textTransform: "uppercase",
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
										</div>
									</div>
								</div>

								{/* Card Content */}
								<div
									style={{
										padding: "16px",
										display: "flex",
										flexDirection: "column",
										gap: 16,
									}}
								>
									{/* Shares and Total Payout Row */}
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "center",
										}}
									>
										<div style={{ flex: 1 }}>
											<div
												style={{
													color: "#888",
													fontSize: 11,
													textTransform: "uppercase",
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
												<span
													className={
														softLoading
															? "soft-blur"
															: undefined
													}
												>
													{winningShares}
												</span>
											</div>
										</div>
										<div
											style={{
												flex: 1,
												textAlign: "right",
											}}
										>
											<div
												style={{
													color: "#888",
													fontSize: 11,
													textTransform: "uppercase",
													letterSpacing: 0.6,
													marginBottom: 4,
												}}
											>
												Total Payout
											</div>
											<div
												style={{
													color: "#16a34a",
													fontSize: 20,
													fontWeight: 700,
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
										</div>
									</div>

									{/* Claim Button */}
									<ClaimButton
										market={market}
										resolvedOutcome={
											resolvedOutcome as "yes" | "no"
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
	const { claim, isClaiming, error } = useClaimEarningsForMarket(
		market,
		resolvedOutcome
	);

	const handleClick = async () => {
		if (isClaiming) return;

		// Trigger fireworks immediately on click
		if (btnRef.current) {
			triggerFireworksForElement(btnRef.current);
			console.log(
				"🎉 FIREWORKS: Triggered immediately on click for",
				market.displayName
			);
		}

		try {
			console.log(
				"🎯 CLAIM BUTTON: Starting claim for market:",
				market.displayName
			);
			const success = await claim();

			if (success) {
				console.log(
					"✅ CLAIM SUCCESS: Transaction completed for",
					market.displayName
				);
				// Call the success callback to remove the market from the view
				const marketId =
					market._id || market.questionId || market.marketId;
				if (onClaimSuccess && marketId) {
					onClaimSuccess(marketId, umbrellaId);
				}
			} else if (error) {
				console.error("❌ CLAIM FAILED:", error);
			}
		} catch (err) {
			console.error("❌ CLAIM ERROR:", err);
		}
	};

	return (
		<button
			ref={btnRef}
			className="side-btn"
			disabled={isClaiming}
			style={{
				width: "100%",
				background: isClaiming ? "#6d28d9" : "#7c3aed",
				color: "#fff",
				border: "none",
				padding: "12px 16px",
				borderRadius: 6,
				fontWeight: 600,
				fontSize: 15,
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
			{isClaiming ? "Claiming..." : "Claim Winnings"}
		</button>
	);
}

