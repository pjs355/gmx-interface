import { useOddsDisplay } from "@/context/OddsDisplayContext";
import {
	ODDS_DISPLAY_SELECT_OPTIONS,
	parseOddsDisplayStyle,
} from "@/features/odds-display/oddsDisplayFormat";
import "./odds-display-select.scss";

export type OddsDisplaySelectProps = {
	/** Root classes — e.g. `all-odds-sport-select` in All Odds toolbar. */
	className?: string;
	/** Optional label shown above the select (settings page). */
	label?: string;
	/** `inline` uses only `className` — no custom chevron styling (toolbar selects). */
	variant?: "default" | "inline";
};

/**
 * Native odds-format picker — same options and persistence as Profile settings.
 */
export default function OddsDisplaySelect({
	className = "",
	label,
	variant = "default",
}: OddsDisplaySelectProps) {
	const { oddsDisplayStyle, setOddsDisplayStyle } = useOddsDisplay();

	const selectClass =
		variant === "inline" ? className.trim() : `odds-display-select ${className}`.trim();

	const select = (
		<select
			value={oddsDisplayStyle}
			onChange={(e) => setOddsDisplayStyle(parseOddsDisplayStyle(e.target.value))}
			className={selectClass || undefined}
			aria-label={label ?? "Odds display format"}
		>
			{ODDS_DISPLAY_SELECT_OPTIONS.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	);

	if (!label) return select;

	return (
		<div className="odds-display-select-field">
			<span className="odds-display-select-field__label">{label}</span>
			{select}
		</div>
	);
}
