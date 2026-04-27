import React, { useMemo, useState, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { triggerFireworksForElement } from "../utils/Fireworks";
import { useClaimForVenue } from "@/helpers/claimEarnings";
import UmbrellaImage from "./UmbrellaImage";
import { formatCurrency } from "../utils/formatCurrency";
import { shortTeamDisplayName } from "../utils/historyOutcomeWinner";
import {
	stripUmbrellaDisplayPrefix,
	titlesMatchVenue,
	umbrellaHeaderLabel,
} from "@/helpers/umbrellaDisplayName";

type MarketEntry = { market: PredictionMarket; yes: string; no: string };

type MergedWinningsRow = {
	label: string;
	winningSide: "Yes" | "No";
	totalShares: number;
	totalPayout: number;
	markets: Array<{ market: PredictionMarket; resolvedOutcome: "yes" | "no" }>;
};

type UnifiedBlock = {
	id: string;
	umbrella: Umbrella;
	allMarkets: MarketEntry[];
};

export default function ResolvedPositionsCardView({
	umbrellaBalances,
	toCentsString,
	onClaimSuccess,
}: {
	umbrellaBalances: Array<{
		umbrella: Umbrella;
		markets: MarketEntry[];
	}>;
	toCentsString: (n?: number | null) => string;
	onClaimSuccess?: (marketId: string | string[], umbrellaId: string) => void | Promise<void>;
}) {
	const unifiedBlocks = useMemo(() => {
		const blocks: UnifiedBlock[] = [];
		const usedIndices = new Set<number>();

		for (let i = 0; i < umbrellaBalances.length; i++) {
			if (usedIndices.has(i)) continue;
			usedIndices.add(i);
			const { umbrella, markets } = umbrellaBalances[i];
			const allMarkets = [...markets];

			for (let j = i + 1; j < umbrellaBalances.length; j++) {
				if (usedIndices.has(j)) continue;
				const other = umbrellaBalances[j];
				if (
					titlesMatchVenue(umbrella.displayName ?? "", other.umbrella.displayName ?? "") ||
					titlesMatchVenue(other.umbrella.displayName ?? "", umbrella.displayName ?? "")
				) {
					allMarkets.push(...other.markets);
					usedIndices.add(j);
				}
			}
			blocks.push({ id: umbrella._id, umbrella, allMarkets });
		}
		return blocks;
	}, [umbrellaBalances]);

	const mergedByBlock = useMemo(() => {
		return unifiedBlocks.map((block) => {
			const sideBuckets: Record<"Yes" | "No", {
				shares: number; markets: Array<{ market: PredictionMarket; resolvedOutcome: "yes" | "no" }>; label: string;
			}> = {
				Yes: { shares: 0, markets: [], label: "" },
				No: { shares: 0, markets: [], label: "" },
			};

			for (const { market, yes, no } of block.allMarkets) {
				const outcome = String((market as any).resolvedOutcome || "").toLowerCase() as "yes" | "no";
				const winningSide: "Yes" | "No" = outcome === "yes" ? "Yes" : "No";
				const shares = winningSide === "Yes" ? Number(yes) : Number(no);
				if (shares <= 0) continue;

				const bucket = sideBuckets[winningSide];
				bucket.shares += shares;
				bucket.markets.push({ market, resolvedOutcome: outcome });

				if (!bucket.label) {
					const title = (market?.displayName || (market as any)?.question || "").trim();
					const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
					if (parts.length === 2) {
						bucket.label = shortTeamDisplayName(winningSide === "Yes" ? parts[0]! : parts[1]!);
					}
				}
			}

			const rows: MergedWinningsRow[] = [];
			for (const side of ["Yes", "No"] as const) {
				const b = sideBuckets[side];
				if (b.shares <= 0) continue;
				rows.push({
					label: b.label || side,
					winningSide: side,
					totalShares: b.shares,
					totalPayout: b.shares,
					markets: b.markets,
				});
			}
			return { block, rows };
		});
	}, [unifiedBlocks]);

	if (mergedByBlock.length === 0) return null;

	return (
		<div className="flex flex-col gap-12">
			{mergedByBlock.map(({ block, rows }) => {
				const blockUmbrellaTitle = umbrellaHeaderLabel(block.umbrella);
				return (
					<div key={block.id} className="umbrella-card">
						{rows.map((row) => {
							const cardId = `${block.id}-${row.winningSide}`;
							return (
								<div
									key={cardId}
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
										<UmbrellaImage umbrella={block.umbrella} />
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
												{blockUmbrellaTitle}
											</div>
											<div style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>
												{row.label}
											</div>
										</div>
									</div>

									{/* Card Content */}
									<div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
										<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
											<div style={{ flex: 1 }}>
												<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
													Shares
												</div>
												<div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>
													{parseFloat(row.totalShares.toFixed(2))}
												</div>
											</div>
											<div style={{ flex: 1, textAlign: "right" }}>
												<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
													Total Payout
												</div>
												<div style={{ color: "#16a34a", fontSize: 20, fontWeight: 700 }}>
													{formatCurrency(row.totalPayout)}
												</div>
											</div>
										</div>

										{/* Claim Button */}
										<MultiClaimButton
											markets={row.markets}
											onClaimSuccess={onClaimSuccess}
											umbrellaId={block.id}
										/>
									</div>
								</div>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}

type ClaimSlotHandle = { fire: () => Promise<boolean> };

const ClaimSlot = forwardRef<ClaimSlotHandle, {
	market: PredictionMarket;
	resolvedOutcome: "yes" | "no";
}>(function ClaimSlot({ market, resolvedOutcome }, ref) {
	const { claim } = useClaimForVenue(market, resolvedOutcome);
	useImperativeHandle(ref, () => ({ fire: claim }), [claim]);
	return null;
}) as React.FC<{ market: PredictionMarket; resolvedOutcome: "yes" | "no"; ref: React.Ref<ClaimSlotHandle> }>;

function MultiClaimButton({
	markets,
	onClaimSuccess,
	umbrellaId,
}: {
	markets: Array<{ market: PredictionMarket; resolvedOutcome: "yes" | "no" }>;
	onClaimSuccess?: (marketId: string | string[], umbrellaId: string) => void | Promise<void>;
	umbrellaId: string;
}) {
	const btnRef = useRef<HTMLButtonElement | null>(null);
	const slotRefs = useRef<Map<number, ClaimSlotHandle>>(new Map());
	const [isClaiming, setIsClaiming] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleClick = useCallback(async () => {
		if (isClaiming) return;
		setIsClaiming(true);
		setError(null);

		if (btnRef.current) triggerFireworksForElement(btnRef.current);

		const claimed: string[] = [];
		try {
			for (let i = 0; i < markets.length; i++) {
				const slot = slotRefs.current.get(i);
				if (slot) {
					const ok = await slot.fire();
					if (ok) {
						const mid = markets[i].market._id || markets[i].market.questionId || markets[i].market.marketId;
						if (mid) claimed.push(mid);
					}
				}
			}
		} catch (e: any) {
			console.error("MULTI-CLAIM ERROR:", e);
			setError(e?.message || String(e));
		} finally {
			if (onClaimSuccess && claimed.length > 0) {
				await new Promise((r) => setTimeout(r, 2000));
				await Promise.resolve(onClaimSuccess(claimed, umbrellaId));
			}
			setIsClaiming(false);
		}
	}, [isClaiming, markets, onClaimSuccess, umbrellaId]);

	const label = isClaiming ? "Claiming..." : "Claim";

	return (
		<>
			{markets.map((m, i) => (
				<ClaimSlot
					key={(m.market._id || m.market.questionId || m.market.marketId) as string}
					ref={(handle) => { if (handle) slotRefs.current.set(i, handle); else slotRefs.current.delete(i); }}
					market={m.market}
					resolvedOutcome={m.resolvedOutcome}
				/>
			))}
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
					transition: "background 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease, opacity 0.15s ease",
					boxShadow: isClaiming ? "0 0 0 0 rgba(0,0,0,0)" : "0 4px 10px rgba(124, 58, 237, 0.35)",
				}}
				onMouseEnter={(e) => { if (!isClaiming) (e.currentTarget as HTMLButtonElement).style.background = "#8b5cf6"; }}
				onMouseLeave={(e) => { if (!isClaiming) (e.currentTarget as HTMLButtonElement).style.background = "#7c3aed"; }}
				onMouseDown={(e) => { if (!isClaiming) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(1px)"; }}
				onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
				onClick={handleClick}
				title={error ? `Error: ${error}` : undefined}
			>
				{label}
			</button>
		</>
	);
}
