import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { useCurtainActions } from "@/components/PredictionMarketTradeBox";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import { resolveOutcomeSideLabels } from "@/features/markets/presentation/outcomeSideLabels";
import { shortenTeamLabelForButton } from "@/features/markets/presentation/marketLabels";
import {
	getBorderColorForSelected,
	getContrastingTextColor,
	hexToRgba,
	mixHexOnBlack,
} from "@/features/markets/presentation/teamColors";
import type { EsportsLeg } from "@/features/markets/presentation/esportsLegs";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { getMarketId } from "./utils";
import "./EsportsLegAccordion.scss";

export type EsportsLegAccordionProps = {
	umbrella: Umbrella;
	legs: EsportsLeg[];
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	onMarketSwitch: (question: PredictionMarket, position: "yes" | "no") => void;
	onPositionChange: (position: "yes" | "no") => void;
	/** Body for the currently expanded leg — the existing chart + orderbook + trade box trio. */
	children: React.ReactNode;
};

/**
 * Vertical accordion of legs for a Panda esports umbrella with `series + map_1 +
 * map_2 + ...` (multi-leg). At most one section is open at a time; Moneyline
 * (series) is open by default *on first mount only* — users can collapse every
 * section if they want. The page-level `activeMarket` is independent of the
 * accordion's open state: closing the expanded section leaves the chart / trade
 * box wired to the most recently picked leg so the user doesn't lose their place.
 *
 * Section headers always show per-team best YES odds in pills that mirror the
 * trade-box `TradeBoxOutcomeButtons` style — full team-color fill when that
 * outcome is the active selection for the page (active leg + active position),
 * 35% tint otherwise. Clicking a pill expands its leg + flips `activePosition`
 * to that outcome (mirrors the trade box: "Team A" = YES, "Team B" = NO).
 * Clicking the chevron toggles the section open/closed without changing the
 * active market.
 *
 * Series-only umbrellas (`legs.length <= 1`) should bypass this component and
 * render `MarketPanels` directly — there is nothing to switch between.
 */
export function EsportsLegAccordion({
	umbrella,
	legs,
	activeMarket,
	activePosition,
	onMarketSwitch,
	onPositionChange,
	children,
}: EsportsLegAccordionProps) {
	const activeQuestionId = activeMarket ? getMarketId(activeMarket) : "";

	/*
	 * `expandedWireKey` is the open section's wire key (or null for "all closed").
	 * Initial value uses the active market's leg if any, falling back to the first
	 * leg (Moneyline). After mount the user controls expansion via header clicks;
	 * we deliberately do NOT auto-expand on activeMarket changes so the user's
	 * "closed" state is preserved when they click pills on collapsed sections.
	 */
	const [expandedWireKey, setExpandedWireKey] = useState<string | null>(() => {
		if (activeQuestionId) {
			const hit = legs.find((leg) => getMarketId(leg.question) === activeQuestionId);
			if (hit) return hit.wireKey;
		}
		return legs[0]?.wireKey ?? null;
	});

	/*
	 * Keep the open section in sync if the user picks an outcome on a collapsed
	 * leg — clicking a team pill on Map 2 expands Map 2. Pure "chevron toggle"
	 * does NOT change activeMarket, so this effect won't fight it.
	 */
	const lastActiveQuestionId = useRef(activeQuestionId);
	useEffect(() => {
		if (!activeQuestionId) return;
		if (activeQuestionId === lastActiveQuestionId.current) return;
		lastActiveQuestionId.current = activeQuestionId;
		const hit = legs.find((leg) => getMarketId(leg.question) === activeQuestionId);
		if (hit) setExpandedWireKey(hit.wireKey);
	}, [activeQuestionId, legs]);

	/*
	 * Trade-curtain opener: on mobile / tablet (≤1100px) the trade box lives
	 * inside a `PredictionCurtain` that starts collapsed. Clicking a team
	 * pill should both commit the leg + side AND surface the trade module so
	 * the user lands in the order-entry flow. On desktop the curtain isn't
	 * mounted and `openCurtain` is a no-op default — safe to call regardless.
	 */
	const { openCurtain } = useCurtainActions();

	const handlePillClick = (leg: EsportsLeg, side: "yes" | "no") => {
		const legId = getMarketId(leg.question);
		setExpandedWireKey(leg.wireKey);
		if (activeQuestionId === legId) {
			// Already the active leg — just flip position (no remount of chart/orderbook).
			if (side !== activePosition) onPositionChange(side);
		} else {
			onMarketSwitch(leg.question, side);
		}
		openCurtain();
	};

	const handleChevronClick = (leg: EsportsLeg) => {
		setExpandedWireKey((prev) => (prev === leg.wireKey ? null : leg.wireKey));
	};

	/*
	 * Header bar is click-to-toggle — clicking anywhere on the row that
	 * isn't a pill or the chevron toggles the section open/closed (label
	 * area, leg name, padding). Pills and chevron stop propagation so their
	 * own click semantics aren't shadowed by the bar toggle. Hover styling
	 * (the soft background tint) is retained as a click affordance.
	 */
	const handleHeaderClick = (leg: EsportsLeg) => {
		setExpandedWireKey((prev) => (prev === leg.wireKey ? null : leg.wireKey));
	};

	return (
		<div className="esports-leg-accordion">
			{legs.map((leg) => {
				const legId = getMarketId(leg.question);
				const isExpanded = leg.wireKey === expandedWireKey;
				const isActiveLeg = Boolean(legId) && legId === activeQuestionId;
				return (
					<section
						key={leg.wireKey}
						className={`esports-leg-accordion__section${
							isExpanded ? " esports-leg-accordion__section--expanded" : ""
						}`}
					>
						<EsportsLegHeader
							umbrella={umbrella}
							leg={leg}
							expanded={isExpanded}
							isActiveLeg={isActiveLeg}
							activePosition={activePosition}
							onPillClick={(side) => handlePillClick(leg, side)}
							onChevronClick={() => handleChevronClick(leg)}
							onHeaderClick={() => handleHeaderClick(leg)}
						/>
						{isExpanded ? (
							<div className="esports-leg-accordion__body">{children}</div>
						) : null}
					</section>
				);
			})}
		</div>
	);
}

type HeaderProps = {
	umbrella: Umbrella;
	leg: EsportsLeg;
	expanded: boolean;
	isActiveLeg: boolean;
	activePosition: "yes" | "no";
	onPillClick: (side: "yes" | "no") => void;
	onChevronClick: () => void;
	onHeaderClick: () => void;
};

/**
 * Section header: leg label (Moneyline / Map N) + two team pills showing live
 * best YES / NO odds + chevron toggle. The whole bar is click-to-toggle — the
 * pills and chevron stop propagation so their own actions (market switch /
 * collapse) aren't shadowed by the bar's toggle handler. Hover styling on the
 * collapsed bar provides the visual affordance for the bar click.
 */
function EsportsLegHeader({
	umbrella,
	leg,
	expanded,
	isActiveLeg,
	activePosition,
	onPillClick,
	onChevronClick,
	onHeaderClick,
}: HeaderProps) {
	const { formatPrice } = useOddsDisplay();
	const { appState } = useOddsMonitor();
	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();

	// Ref-counted subscription so the collapsed leg's odds stream live even
	// before the user expands it (deduped with other consumers of the same key).
	useEffect(() => {
		if (!leg.wireKey) return;
		subscribePandaMatchId(leg.wireKey);
		return () => unsubscribePandaMatchId(leg.wireKey);
	}, [leg.wireKey, subscribePandaMatchId, unsubscribePandaMatchId]);

	const matched = useMatchVenuePrices(leg.wireKey || null, null);
	const { yes, no } = useMemo(
		// `matched` is mutated in place on WS ticks; include appState.timestamp.
		() => listingBestYesNoFromMatched(matched),
		[matched, appState?.timestamp],
	);

	const sideLabels = useMemo(
		() => resolveOutcomeSideLabels({ umbrella, market: leg.question }),
		[umbrella, leg.question],
	);

	const teamAColor = (leg.question as { yesColor?: string })?.yesColor || "#22c55e";
	const teamBColor = (leg.question as { noColor?: string })?.noColor || "#ef4444";
	const teamAName = shortenTeamLabelForButton(sideLabels.yesLabel);
	const teamBName = shortenTeamLabelForButton(sideLabels.noLabel);

	const yesCents = typeof yes === "number" && Number.isFinite(yes) ? formatPrice(yes) : "--";
	const noCents = typeof no === "number" && Number.isFinite(no) ? formatPrice(no) : "--";

	const ChevronIcon = expanded ? FiChevronDown : FiChevronRight;

	const yesActive = isActiveLeg && activePosition === "yes";
	const noActive = isActiveLeg && activePosition === "no";

	return (
		<div
			className={`esports-leg-accordion__header${
				expanded ? " esports-leg-accordion__header--expanded" : ""
			}`}
			role="button"
			tabIndex={0}
			aria-expanded={expanded}
			onClick={onHeaderClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onHeaderClick();
				}
			}}
		>
			<span className="esports-leg-accordion__label">{leg.label}</span>
			<span className="esports-leg-accordion__odds-group">
				<TeamPill
					name={teamAName}
					title={sideLabels.yesLabel}
					price={yesCents}
					color={teamAColor}
					active={yesActive}
					onClick={() => onPillClick("yes")}
				/>
				<TeamPill
					name={teamBName}
					title={sideLabels.noLabel}
					price={noCents}
					color={teamBColor}
					active={noActive}
					onClick={() => onPillClick("no")}
				/>
			</span>
			<button
				type="button"
				className="esports-leg-accordion__chevron"
				aria-label={expanded ? `Collapse ${leg.label}` : `Expand ${leg.label}`}
				aria-expanded={expanded}
				onClick={(e) => {
					// Don't let the bar's onClick fire — chevron is the explicit
					// toggle and would otherwise double-fire (toggle → re-toggle).
					e.stopPropagation();
					onChevronClick();
				}}
			>
				<ChevronIcon aria-hidden="true" />
			</button>
		</div>
	);
}

type TeamPillProps = {
	name: string;
	title: string;
	price: string;
	color: string;
	active: boolean;
	onClick: () => void;
};

/**
 * Team-color pill matching `TradeBoxOutcomeButtons` styling — active = solid
 * fill + thick border in `getBorderColorForSelected(color)`, inactive = 35%
 * tint background + 35% tint border. Hover on inactive promotes the border to
 * full team color so the click affordance is obvious.
 */
function TeamPill({ name, title, price, color, active, onClick }: TeamPillProps) {
	const [hovered, setHovered] = useState(false);
	const background = active ? color : hexToRgba(color, 0.35);
	// Match TradeBoxOutcomeButtons: text contrast computed against the actual
	// perceived background (solid color vs. 35%-on-black blend).
	const text = active
		? getContrastingTextColor(color)
		: getContrastingTextColor(mixHexOnBlack(color, 0.35));
	const borderColor = active
		? getBorderColorForSelected(color)
		: hovered
			? color
			: hexToRgba(color, 0.35);

	return (
		<button
			type="button"
			className={`esports-leg-accordion__odds-pill${
				active ? " esports-leg-accordion__odds-pill--active" : ""
			}`}
			title={title}
			onClick={(e) => {
				// Header bar is itself click-to-toggle; pill clicks own the
				// market-switch + (mobile) curtain-open semantics and must not
				// bubble into the header toggle.
				e.stopPropagation();
				onClick();
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				background,
				color: text,
				border: `2px solid ${borderColor}`,
			}}
		>
			<span className="esports-leg-accordion__odds-pill-team">{name}</span>
			<span className="esports-leg-accordion__odds-pill-price">{price}</span>
		</button>
	);
}
