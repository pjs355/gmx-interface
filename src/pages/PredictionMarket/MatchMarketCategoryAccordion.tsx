import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCurtainActions } from "@/components/PredictionMarketTradeBox";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { TeamMapping } from "@/features/markets/listing/matchProps";
import type { PropLadder } from "@/features/markets/listing/matchProps";
import {
	categoryForActiveMarket,
	MATCH_MARKET_CATEGORY_IDS,
	type MatchMarketCategory,
} from "@/features/markets/presentation/matchMarketCategories";
import { ThreeWayLegSelector } from "./ThreeWayLegSelector";
import { PropLadderBlock } from "./MatchPropsSection";
import { MarketSectionAccordion } from "./MarketSectionAccordion";
import "./MatchMarketCategoryAccordion.scss";

export type MatchMarketCategoryAccordionProps = {
	moneylineLegs: PredictionMarket[];
	ladders: PropLadder[];
	teamMappings?: TeamMapping[];
	activeMarket: PredictionMarket | null;
	activeMarketId: string;
	activePosition: "yes" | "no";
	onMoneylineSelect: (question: PredictionMarket) => void;
	onPropSelect: (
		question: PredictionMarket,
		position: "yes" | "no",
		selectionTitle: string,
	) => void;
	renderSectionBody: (category: MatchMarketCategory) => React.ReactNode;
};

/**
 * FIFA (and future 3-way + props) match trading page: Moneyline, Spread, and
 * Total Goals as collapsible sections. Headers reuse existing ladder / pill UI;
 * expanded bodies host per-category chart + orderbook (via render prop).
 */
export function MatchMarketCategoryAccordion({
	moneylineLegs,
	ladders,
	teamMappings,
	activeMarket,
	activeMarketId,
	activePosition,
	onMoneylineSelect,
	onPropSelect,
	renderSectionBody,
}: MatchMarketCategoryAccordionProps) {
	const { openCurtain } = useCurtainActions();

	const [expandedCategory, setExpandedCategory] = useState<MatchMarketCategory | null>("moneyline");

	const activeCategory = categoryForActiveMarket(activeMarket);
	const lastActiveMarketId = useRef(activeMarketId);
	/** Header odds buttons update the trade box but must not expand/collapse sections. */
	const skipExpandSyncRef = useRef(false);
	useEffect(() => {
		if (skipExpandSyncRef.current) {
			skipExpandSyncRef.current = false;
			lastActiveMarketId.current = activeMarketId;
			return;
		}
		if (!activeMarketId || !activeCategory) return;
		if (activeMarketId === lastActiveMarketId.current) return;
		lastActiveMarketId.current = activeMarketId;
		setExpandedCategory(activeCategory);
	}, [activeMarketId, activeCategory]);

	const spreadLadder = useMemo(() => ladders.find((l) => l.kind === "spread"), [ladders]);
	const totalLadder = useMemo(() => ladders.find((l) => l.kind === "total"), [ladders]);

	const handleMoneylineSelect = (question: PredictionMarket) => {
		skipExpandSyncRef.current = true;
		onMoneylineSelect(question);
		openCurtain();
	};

	const handlePropSelect = (
		_question: PredictionMarket,
		_position: "yes" | "no",
		_selectionTitle: string,
	) => {
		skipExpandSyncRef.current = true;
		onPropSelect(_question, _position, _selectionTitle);
		openCurtain();
	};

	const toggleSection = (category: MatchMarketCategory) => (e: React.MouseEvent) => {
		if (!(e.target instanceof HTMLElement)) return;
		if (e.target.closest(".match-props__cell, .three-way-leg-selector__btn")) return;
		e.stopPropagation();
		setExpandedCategory((prev) => (prev === category ? null : category));
	};

	const sections = [
		{
			id: MATCH_MARKET_CATEGORY_IDS.moneyline,
			ariaLabel: "Moneyline",
			header: (
				<div
					className="match-market-category-accordion__moneyline-header match-market-category-accordion__section-hit"
					onClick={toggleSection("moneyline")}
				>
					<div className="match-props__group">
						<div className="match-props__header">
							<h4 className="match-props__title">Moneyline</h4>
						</div>
						<div className="match-market-category-accordion__odds-controls">
							<ThreeWayLegSelector
								legs={moneylineLegs}
								activeMarketId={activeMarketId}
								onSelect={handleMoneylineSelect}
								teamMappings={teamMappings}
							/>
						</div>
					</div>
				</div>
			),
			body: renderSectionBody("moneyline"),
		},
		...(spreadLadder
			? [
					{
						id: MATCH_MARKET_CATEGORY_IDS.spread,
						ariaLabel: spreadLadder.title,
						header: (
							<div
								className="match-market-category-accordion__props-header match-market-category-accordion__section-hit"
								onClick={toggleSection("spread")}
							>
								<div className="match-props__group">
									<div className="match-props__header">
										<h4 className="match-props__title">{spreadLadder.title}</h4>
									</div>
									<div className="match-market-category-accordion__odds-controls">
										<PropLadderBlock
											ladder={spreadLadder}
											hideTitle
											activeMarketId={activeMarketId}
											activePosition={activePosition}
											onSelect={(q, p, title) => handlePropSelect(q, p, title)}
										/>
									</div>
								</div>
							</div>
						),
						body: renderSectionBody("spread"),
					},
				]
			: []),
		...(totalLadder
			? [
					{
						id: MATCH_MARKET_CATEGORY_IDS.total,
						ariaLabel: totalLadder.title,
						header: (
							<div
								className="match-market-category-accordion__props-header match-market-category-accordion__section-hit"
								onClick={toggleSection("total")}
							>
								<div className="match-props__group">
									<div className="match-props__header">
										<h4 className="match-props__title">{totalLadder.title}</h4>
									</div>
									<div className="match-market-category-accordion__odds-controls">
										<PropLadderBlock
											ladder={totalLadder}
											hideTitle
											activeMarketId={activeMarketId}
											activePosition={activePosition}
											onSelect={(q, p, title) => handlePropSelect(q, p, title)}
										/>
									</div>
								</div>
							</div>
						),
						body: renderSectionBody("total"),
					},
				]
			: []),
	];

	return (
		<MarketSectionAccordion
			className="match-market-category-accordion"
			sections={sections}
			defaultExpandedId={MATCH_MARKET_CATEGORY_IDS.moneyline}
			expandedId={expandedCategory}
			onExpandedChange={(id) =>
				setExpandedCategory(id as MatchMarketCategory | null)
			}
		/>
	);
}
