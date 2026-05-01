import React, { useMemo, useState, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { triggerFireworksForElement } from "../utils/Fireworks";
import { useClaimForVenue } from "@/helpers/claimEarnings";
import ScrollableTable from "@/components/ScrollableTable/ScrollableTable";
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

export default function ResolvedPositionsTable({
	umbrellaBalances,
	onClaimSuccess,
}: {
	umbrellaBalances: Array<{
		umbrella: Umbrella;
		markets: MarketEntry[];
	}>;
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
		<div className="flex flex-col gap-8">
			<ScrollableTable minWidth="600px">
				<div
					className="positions-header grid items-center px-12 py-10"
					style={{
						gridTemplateColumns: "minmax(200px, 2fr) repeat(3, 1fr) 1fr",
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
					{mergedByBlock.map(({ block, rows }) => (
						<div key={block.id} className="umbrella-block">
							<div
								className="grid px-12 py-10"
								style={{
									gridTemplateColumns: "minmax(200px, 2fr) repeat(4, 1fr)",
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
									<UmbrellaImage umbrella={block.umbrella} />
									{umbrellaHeaderLabel(block.umbrella)}
								</div>
							</div>

							{rows.map((row) => (
								<div
									key={`${block.id}-${row.winningSide}`}
									className="grid items-center px-12 py-12 position-row"
									style={{
										gridTemplateColumns: "minmax(200px, 2fr) repeat(3, 1fr) 1fr",
										borderBottom: "1px solid #1f1f1f",
										fontSize: 16,
									}}
								>
									<div style={{ color: "#fff", fontWeight: 600 }}>
										{row.label}
									</div>
									<div style={{ textAlign: "center", color: "#fff" }}>
										{parseFloat(row.totalShares.toFixed(2))}
									</div>
									<div style={{ textAlign: "center", color: "#fff" }}>$1</div>
									<div style={{ textAlign: "center", color: "#16a34a", fontWeight: 700, fontSize: 20 }}>
										{formatCurrency(row.totalPayout)}
									</div>
									<div style={{ textAlign: "center" }}>
										<MultiClaimButton
											markets={row.markets}
											onClaimSuccess={onClaimSuccess}
											umbrellaId={block.id}
										/>
									</div>
								</div>
							))}
						</div>
					))}
				</div>
			</ScrollableTable>
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
					background: isClaiming ? "#6d28d9" : "#7c3aed",
					color: "#fff",
					border: "none",
					padding: "10px 16px",
					borderRadius: 6,
					fontWeight: 600,
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
