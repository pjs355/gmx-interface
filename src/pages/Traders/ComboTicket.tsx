import { Link } from "react-router-dom";

import type { ComboLegSummary } from "@/services/api/whaleTrackerService";

import { TraderAvatar } from "./TraderAvatar";
import { usePrefetchTraderProfile } from "./prefetch";
import { useOddsLabel } from "./useOddsLabel";
import { betSideLabel, cleanMarketTitle, formatUsdAbbrev } from "./format";
// Ticket styles live in the Traders stylesheet; importing here keeps them
// available when a ticket renders on the profile page directly.
import "./Traders.scss";

export type ComboTicketVariant = "live" | "won" | "lost";

type ComboLegState = "won" | "lost" | "pending";

/** legStatus is raw Polymarket: OPEN / RESOLVED_WIN / RESOLVED_LOSS. */
function comboLegState(leg: ComboLegSummary): ComboLegState {
	if (/win|won/i.test(leg.legStatus)) return "won";
	if (/loss|lost/i.test(leg.legStatus)) return "lost";
	return "pending";
}

/** "Spain vs. Austria - More Markets" → "Spain vs. Austria". */
function cleanEventTitle(title?: string): string {
	if (!title) return "";
	return title.replace(/\s*-\s*more markets\s*$/i, "").trim();
}

/**
 * Price used for a leg's odds everywhere on the ticket: live market price
 * while pending, last-seen live price once settled (settled legs collapse
 * `legCurrentPrice` to 0/1, which is not odds).
 */
function legDisplayPrice(leg: ComboLegSummary): number | undefined {
	const price =
		comboLegState(leg) === "pending" ? leg.legCurrentPrice : leg.legLastLivePrice;
	return price !== undefined && price > 0 && price < 1 ? price : undefined;
}

/**
 * Parlay implied probability = product of the leg probabilities — the same
 * prices shown per leg, so the total always reconciles with the rail below.
 * Undefined when any leg lacks a usable price (caller falls back to
 * stake/payout).
 */
function comboImpliedProb(legs: ComboLegSummary[]): number | undefined {
	let product = 1;
	for (const leg of legs) {
		const price = legDisplayPrice(leg);
		if (price === undefined) return undefined;
		product *= price;
	}
	return product;
}

/** Crisp inline check — the "this leg already hit" indicator. */
function LegCheckIcon() {
	return (
		<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
			<path
				d="M2.2 6.4 4.8 9l5-6"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function LegCrossIcon() {
	return (
		<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
			<path
				d="M2.5 2.5 9.5 9.5 M9.5 2.5 2.5 9.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/**
 * Side pill for one combo leg. Yes/No legs go through the shared
 * `betSideLabel` rule (O/U legs read Over/Under); named-team legs render
 * as a neutral pill.
 */
function LegSideTag({ leg }: { leg: ComboLegSummary }) {
	const raw = leg.legOutcomeLabel?.trim() ?? "";
	const isYes = /^yes$/i.test(raw);
	const isNo = /^no$/i.test(raw);
	if (isYes || isNo) {
		const label = betSideLabel({
			outcome: isYes ? "yes" : "no",
			marketTitle: leg.marketTitle,
		});
		return (
			<span className={`traders-side-tag ${isYes ? "is-yes" : "is-no"}`}>{label}</span>
		);
	}
	if (!raw) return null;
	return <span className="traders-side-tag is-neutral">{raw}</span>;
}

/**
 * Combo titles arrive as "Team A [Yes] + Team B [No] + …" — legacy
 * fallback for rows cached before the API sent legs.
 */
function ComboTitleFallback({ title }: { title?: string }) {
	if (!title) return null;
	const parts = title.split(/\[(Yes|No)\]/g);
	return (
		<span className="traders-item-market is-wrap" title={title}>
			{parts.map((part, i) =>
				part === "Yes" || part === "No" ? (
					<span
						key={i}
						className={`traders-side-tag ${part === "Yes" ? "is-yes" : "is-no"}`}
					>
						{part}
					</span>
				) : (
					<span key={i}>{part}</span>
				),
			)}
		</span>
	);
}

/**
 * Sportsbook-style parlay ticket, shared by the Traders feed and the
 * profile page so combos read identically everywhere.
 *
 * Layout: header (identity/time on the left, odds + stake → payout
 * pinned top-right so the right edge is skimmable), then one line per
 * leg on the classic parlay rail. Settled legs keep their real odds via
 * `legLastLivePrice` — green when the leg hit, red when it died.
 */
export function ComboTicket({
	wallet,
	name,
	imageUrl,
	comboTitle,
	legs,
	costUsd,
	payoutUsd,
	variant,
	timeLabel,
	linkToProfile = true,
}: {
	wallet: string;
	/** Omit to hide the identity block (e.g. on the trader's own profile). */
	name?: string;
	imageUrl?: string;
	comboTitle?: string;
	legs?: ComboLegSummary[];
	costUsd: number;
	/** Realized payout on settled combos; potential payout on live ones. */
	payoutUsd: number;
	variant: ComboTicketVariant;
	/** e.g. "placed 2h ago" / "settled Jun 28". */
	timeLabel?: string;
	linkToProfile?: boolean;
}) {
	const prefetch = usePrefetchTraderProfile();
	const oddsLabel = useOddsLabel();
	// Parlay odds = product of the leg probabilities (the prices shown on the
	// rail below), rendered in the user's chosen odds format. Stake/payout is
	// only a fallback for legacy rows without legs or with unpriced legs — it
	// reflects the wallet's position bookkeeping, not the ticket's true odds.
	const legProb = legs && legs.length > 0 ? comboImpliedProb(legs) : undefined;
	const impliedProb =
		legProb !== undefined ? legProb : payoutUsd > 0 ? costUsd / payoutUsd : undefined;
	const comboOdds = impliedProb !== undefined ? oddsLabel(impliedProb) : "";
	const lost = variant === "lost";

	const body = (
		<>
			<div className="traders-ticket-head">
				{name && (
					<>
						<TraderAvatar wallet={wallet} displayName={name} imageUrl={imageUrl} size={28} />
						<span className="traders-ticket-name">{name}</span>
					</>
				)}
				{timeLabel && <span className="traders-ticket-time">{timeLabel}</span>}
				<div className="traders-ticket-corner">
					{comboOdds && <span className="traders-ticket-corner-odds">{comboOdds}</span>}
					<span className="traders-ticket-corner-payline">
						{formatUsdAbbrev(costUsd)}
						<span className="traders-item-arrow"> → </span>
						<span className={lost ? "is-loss" : "is-win"}>
							{formatUsdAbbrev(payoutUsd)}
						</span>
					</span>
				</div>
			</div>
			{legs && legs.length > 0 ? (
				<ol className="traders-ticket-legs">
					{legs.map((leg) => {
						const state = comboLegState(leg);
						const event = cleanEventTitle(leg.eventTitle);
						const title = cleanMarketTitle(leg.marketTitle) || event;
						// Pending legs show the live market price; settled legs
						// show the last price seen while live — the odds the leg
						// actually was — colored by how it ended.
						const price = legDisplayPrice(leg);
						const odds = price !== undefined ? oddsLabel(price) : "";
						return (
							<li key={leg.legIndex} className={`traders-ticket-leg is-${state}`}>
								<span className="traders-ticket-leg-marker" aria-hidden="true">
									{state === "won" ? (
										<LegCheckIcon />
									) : state === "lost" ? (
										<LegCrossIcon />
									) : null}
								</span>
								<span className="traders-ticket-leg-main">
									<span className="traders-ticket-leg-title">
										{title}
										<LegSideTag leg={leg} />
									</span>
									{event && event !== title && (
										<span className="traders-ticket-leg-event">{event}</span>
									)}
								</span>
								{odds && (
									<span className={`traders-ticket-leg-odds is-${state}`}>{odds}</span>
								)}
							</li>
						);
					})}
				</ol>
			) : (
				<ComboTitleFallback title={comboTitle} />
			)}
		</>
	);

	if (!linkToProfile) {
		return <div className="traders-item is-ticket is-static">{body}</div>;
	}
	return (
		<Link
			to={`/traders/${wallet}`}
			className="traders-item is-ticket"
			onMouseEnter={() => prefetch(wallet)}
			onFocus={() => prefetch(wallet)}
		>
			{body}
		</Link>
	);
}
