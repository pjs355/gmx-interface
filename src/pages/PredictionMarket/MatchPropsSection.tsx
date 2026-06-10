import { useEffect, useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import type {
	MatchPropPosition,
	PropLadder,
	PropLadderCell,
	PropLadderRow,
} from "@/features/markets/listing/matchProps";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { getMarketId } from "./utils";
import "./MatchPropsSection.scss";

type Props = {
	/** Built once per umbrella via {@link buildMatchPropLadders}. */
	ladders: PropLadder[];
	/** Market id + side of the currently active trade selection. */
	activeMarketId: string;
	activePosition: MatchPropPosition;
	/** Route the selection into chart / orderbook / trade box (same as moneyline legs). */
	onSelect: (
		question: PredictionMarket,
		position: MatchPropPosition,
		selectionTitle: string,
	) => void;
};

/**
 * Spreads + totals below the moneyline on the match trading page. One ladder
 * per market kind: a fixed row-label column (team / Over / Under) beside a
 * single horizontal carousel where every line is a selectable cell with its
 * live price — "MEX -1.5 31¢", "RSA +1.5 69¢", "O 2.5 44¢" — so no line value
 * is ever repeated as text. Selecting a cell makes that market + side the
 * active trade (trade box, orderbooks tab) exactly like picking a moneyline leg.
 */
export function MatchPropsSection({ ladders, activeMarketId, activePosition, onSelect }: Props) {
	if (ladders.length === 0) return null;
	return (
		<div className="match-props">
			{ladders.map((ladder) => (
				<PropLadderBlock
					key={ladder.kind}
					ladder={ladder}
					activeMarketId={activeMarketId}
					activePosition={activePosition}
					onSelect={onSelect}
				/>
			))}
		</div>
	);
}

export function PropLadderBlock({
	ladder,
	activeMarketId,
	activePosition,
	onSelect,
	hideTitle = false,
}: {
	ladder: PropLadder;
	activeMarketId: string;
	activePosition: MatchPropPosition;
	onSelect: (
		question: PredictionMarket,
		position: MatchPropPosition,
		selectionTitle: string,
	) => void;
	/** Omit the title row when the parent renders it as the accordion toggle bar. */
	hideTitle?: boolean;
}) {
	const ladderContent = (
		<div className="match-props__ladder">
			<div className="match-props__labels">
				{ladder.rows.map((row) => (
					<div key={row.key} className="match-props__row-label">
						{row.logoUrl ? (
							<img className="match-props__row-logo" src={row.logoUrl} alt="" loading="lazy" />
						) : null}
						<span className="match-props__row-label-text">{row.label}</span>
					</div>
				))}
			</div>
			<div className="match-props__scroll">
				{ladder.rows.map((row) => (
					<div key={row.key} className="match-props__row" role="radiogroup" aria-label={`${ladder.title} — ${row.label}`}>
						{row.cells.map((cell, i) =>
							cell ? (
								<PropCellButton
									key={`${row.key}-${cell.label}`}
									cell={cell}
									row={row}
									active={
										getMarketId(cell.question) === activeMarketId &&
										cell.position === activePosition
									}
									onSelect={onSelect}
								/>
							) : (
								<div key={`${row.key}-empty-${ladder.columns[i]}`} className="match-props__cell match-props__cell--empty" aria-hidden="true" />
							),
						)}
					</div>
				))}
			</div>
		</div>
	);

	if (hideTitle) return ladderContent;

	return (
		<div className="match-props__group">
			<div className="match-props__header">
				<h4 className="match-props__title">{ladder.title}</h4>
			</div>
			{ladderContent}
		</div>
	);
}

function PropCellButton({
	cell,
	row,
	active,
	onSelect,
}: {
	cell: PropLadderCell;
	row: PropLadderRow;
	active: boolean;
	onSelect: (
		question: PredictionMarket,
		position: MatchPropPosition,
		selectionTitle: string,
	) => void;
}) {
	const { formatPrice } = useOddsDisplay();
	const { appState } = useOddsMonitor();
	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();

	const venueKey =
		typeof cell.question.polymarketMarketId === "string"
			? cell.question.polymarketMarketId.trim()
			: "";

	// Ref-counted venue-prices subscription (deduped across the yes/no cells of
	// the same market and with the trade box / orderbooks tab).
	useEffect(() => {
		if (!venueKey) return;
		subscribePandaMatchId(venueKey);
		return () => unsubscribePandaMatchId(venueKey);
	}, [venueKey, subscribePandaMatchId, unsubscribePandaMatchId]);

	const matched = useMatchVenuePrices(venueKey || null, null);
	const price = useMemo(() => {
		// `matched` is mutated in place on WS ticks; `appState.timestamp` forces recompute.
		const { yes, no } = listingBestYesNoFromMatched(matched);
		const raw = cell.position === "yes" ? yes : no;
		return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
	}, [matched, appState?.timestamp, cell.position]);

	const accent = row.color?.trim() || undefined;

	return (
		<button
			type="button"
			role="radio"
			aria-checked={active}
			className={`match-props__cell${active ? " match-props__cell--active" : ""}`}
			style={active && accent ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}` } : undefined}
			onClick={(e) => {
				e.stopPropagation();
				onSelect(cell.question, cell.position, cell.selectionTitle);
			}}
		>
			<span className="match-props__cell-line">{cell.label}</span>
			<span className="match-props__cell-price">{price !== null ? formatPrice(price) : "--"}</span>
		</button>
	);
}
