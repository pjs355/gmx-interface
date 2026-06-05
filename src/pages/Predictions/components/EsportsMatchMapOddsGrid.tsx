import { useMemo, type ReactNode } from "react";
import type { MatchedMarket } from "@/types/odds-monitor";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { resolveOutcomeSideLabels } from "@/features/markets/presentation/outcomeSideLabels";
import { shortenTeamLabelForButton } from "@/features/markets/presentation/marketLabels";
import { getContrastingTextColor } from "@/features/markets/presentation/teamColors";
import { oddsBarPercent } from "@/features/markets/pricing/orderbookDisplayPrices";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PandaOddsRowSpec } from "@/features/markets/presentation/pandaOddsRows";
import "./EsportsMatchMapOddsGrid.scss";

type Props = {
	specs: PandaOddsRowSpec[];
	markets: MatchedMarket[] | null | undefined;
	/** Forces recompute when the WS store mutates rows in place. */
	storeTimestamp?: number;
	umbrella: Umbrella;
	/** Series match-winner question — source of the team colors (yes = team A). */
	question: PredictionMarket;
	teamALogo?: ReactNode;
	teamBLogo?: ReactNode;
	/** When the logo is CSS-inverted (dark team color on dark bg), the odds bar uses white. */
	teamAInvertLogo?: boolean;
	teamBInvertLogo?: boolean;
	onSelect: () => void;
};

function findByWireKey(
	markets: MatchedMarket[] | null | undefined,
	wireKey: string,
): MatchedMarket | null {
	if (!markets?.length) return null;
	// Strict wire-key match — never fall back to umbrellaId, or a map column
	// would resolve to the series column (and vice versa).
	return markets.find((m) => String(m.pandaMatchId ?? "").trim() === wireKey) ?? null;
}

function columnLabel(spec: PandaOddsRowSpec): string {
	return spec.slot === null ? "Series" : `Map ${spec.slot}`;
}

/**
 * Panda esports umbrella odds, laid out as a matrix: the two teams are rows and
 * each market (Series, Map 1, Map 2, …) is a column. Each cell is a team-colored
 * price button (yes = team A `yesColor`, no = team B `noColor`) with a team-colored
 * odds bar — the same color scheme as the single-market moneyline card.
 */
export function EsportsMatchMapOddsGrid({
	specs,
	markets,
	storeTimestamp,
	umbrella,
	question,
	teamALogo,
	teamBLogo,
	teamAInvertLogo = false,
	teamBInvertLogo = false,
	onSelect,
}: Props) {
	const { formatPrice } = useOddsDisplay();

	const cols = useMemo(
		() =>
			specs.map((spec) => {
				const matched = findByWireKey(markets, spec.wireKey);
				const { yes, no } = listingBestYesNoFromMatched(matched);
				return { spec, yes, no };
			}),
		// storeTimestamp drives recompute since rows are mutated in place.
		[specs, markets, storeTimestamp],
	);

	const sideLabels = useMemo(
		() => resolveOutcomeSideLabels({ umbrella, market: question }),
		[umbrella, question],
	);

	const teamAColor = (question as { yesColor?: string })?.yesColor || "#22c55e";
	const teamBColor = (question as { noColor?: string })?.noColor || "#ef4444";
	const teamAText = getContrastingTextColor(teamAColor);
	const teamBText = getContrastingTextColor(teamBColor);
	// When the logo is inverted (dark team color rendered on a dark card), the
	// team-colored odds bar would be invisible — use white for it instead.
	const teamABarColor = teamAInvertLogo ? "#ffffff" : teamAColor;
	const teamBBarColor = teamBInvertLogo ? "#ffffff" : teamBColor;
	const teamAName = shortenTeamLabelForButton(sideLabels.yesLabel);
	const teamBName = shortenTeamLabelForButton(sideLabels.noLabel);

	const fmt = (p: number | null) => (p == null ? "—" : formatPrice(p));

	const gridStyle = {
		gridTemplateColumns: `minmax(96px, 1.2fr) repeat(${specs.length}, minmax(0, 1fr))`,
	};

	const renderCell = (
		price: number | null,
		chipBg: string,
		chipText: string,
		barColor: string,
		key: string,
	) => {
		if (price == null) {
			return (
				<span key={key} className="esports-grid__cell esports-grid__cell--empty">
					—
				</span>
			);
		}
		const barPct = oddsBarPercent(price);
		return (
			<button
				type="button"
				key={key}
				className="esports-grid__cell esports-grid__cell--price"
				onClick={onSelect}
			>
				<span className="esports-grid__chip" style={{ background: chipBg, color: chipText }}>
					{fmt(price)}
				</span>
				{barPct !== null ? (
					<span className="esports-grid__bar" aria-hidden="true">
						<span
							className="esports-grid__bar-fill"
							style={{ width: `${barPct}%`, background: barColor }}
						/>
					</span>
				) : null}
			</button>
		);
	};

	return (
		<div className="esports-grid" style={gridStyle}>
			<span className="esports-grid__corner" aria-hidden="true" />
			{cols.map(({ spec }) => (
				<span key={`head-${spec.wireKey}`} className="esports-grid__colhead">
					{columnLabel(spec)}
				</span>
			))}

			<span className="esports-grid__team">
				<span className="esports-grid__team-logo">{teamALogo}</span>
				<span className="esports-grid__team-name" title={sideLabels.yesLabel}>
					{teamAName}
				</span>
			</span>
			{cols.map(({ spec, yes }) =>
				renderCell(yes, teamAColor, teamAText, teamABarColor, `a-${spec.wireKey}`),
			)}

			<span className="esports-grid__team">
				<span className="esports-grid__team-logo">{teamBLogo}</span>
				<span className="esports-grid__team-name" title={sideLabels.noLabel}>
					{teamBName}
				</span>
			</span>
			{cols.map(({ spec, no }) =>
				renderCell(no, teamBColor, teamBText, teamBBarColor, `b-${spec.wireKey}`),
			)}
		</div>
	);
}
