import React, { useState } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import "./MarketSectionAccordion.scss";

export type MarketSectionAccordionItem = {
	id: string;
	/** Header row content (pills, ladders, labels). Clicks should stopPropagation when they own selection semantics. */
	header: React.ReactNode;
	/** Expanded body (chart + orderbook tabs). */
	body: React.ReactNode;
	/** Accessible label for chevron / section. */
	ariaLabel: string;
};

export type MarketSectionAccordionProps = {
	sections: MarketSectionAccordionItem[];
	/** Section id open on first mount when uncontrolled (e.g. "moneyline"). */
	defaultExpandedId: string;
	/** Controlled expanded section id. */
	expandedId?: string | null;
	/** Called when user toggles a section. */
	onExpandedChange?: (id: string | null) => void;
	className?: string;
};

/**
 * Generic single-expand vertical accordion. At most one section is open at a
 * time; users can collapse every section. Header bar click toggles; chevron
 * toggles without bubbling to header handlers that also switch markets.
 */
export function MarketSectionAccordion({
	sections,
	defaultExpandedId,
	expandedId: controlledExpandedId,
	onExpandedChange,
	className,
}: MarketSectionAccordionProps) {
	const [uncontrolledExpandedId, setUncontrolledExpandedId] = useState<string | null>(() => {
		if (sections.some((s) => s.id === defaultExpandedId)) return defaultExpandedId;
		return sections[0]?.id ?? null;
	});

	const isControlled = controlledExpandedId !== undefined;
	const expandedId = isControlled ? controlledExpandedId : uncontrolledExpandedId;

	const setExpandedId = (id: string | null) => {
		if (!isControlled) setUncontrolledExpandedId(id);
		onExpandedChange?.(id);
	};

	const rootClass = ["market-section-accordion", className].filter(Boolean).join(" ");

	return (
		<div className={rootClass}>
			{sections.map((section) => {
				const isExpanded = section.id === expandedId;
				const ChevronIcon = isExpanded ? FiChevronDown : FiChevronRight;

				const handleHeaderClick = () => {
					setExpandedId(isExpanded ? null : section.id);
				};

				const handleChevronClick = (e: React.MouseEvent) => {
					e.stopPropagation();
					setExpandedId(isExpanded ? null : section.id);
				};

				return (
					<section
						key={section.id}
						className={`market-section-accordion__section${
							isExpanded ? " market-section-accordion__section--expanded" : ""
						}`}
					>
						<div
							className={`market-section-accordion__header${
								isExpanded ? " market-section-accordion__header--expanded" : ""
							}`}
							role="button"
							tabIndex={0}
							aria-expanded={isExpanded}
							aria-label={section.ariaLabel}
							onClick={handleHeaderClick}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleHeaderClick();
								}
							}}
						>
							{section.header}
							<button
								type="button"
								className="market-section-accordion__chevron"
								aria-label={isExpanded ? `Collapse ${section.ariaLabel}` : `Expand ${section.ariaLabel}`}
								aria-expanded={isExpanded}
								onClick={handleChevronClick}
							>
								<ChevronIcon aria-hidden="true" />
							</button>
						</div>
						{isExpanded ? (
							<div className="market-section-accordion__body">{section.body}</div>
						) : null}
					</section>
				);
			})}
		</div>
	);
}
