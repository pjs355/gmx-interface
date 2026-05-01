import { Menu } from "@headlessui/react";
import { PiSlidersHorizontal } from "react-icons/pi";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { ODDS_DISPLAY_SELECT_OPTIONS } from "@/utils/oddsDisplayFormat";

/**
 * Home calendar header — opens an odds-format menu (same persistence as Profile).
 */
export default function PredictionsCalendarOddsPicker() {
	const { oddsDisplayStyle, setOddsDisplayStyle } = useOddsDisplay();

	return (
		<Menu as="div" className="prediction-calendar-odds-menu">
			<Menu.Button
				type="button"
				className="prediction-calendar-odds-trigger"
				aria-label="Odds display"
			>
				<PiSlidersHorizontal size={22} aria-hidden />
			</Menu.Button>
			<Menu.Items className="prediction-calendar-odds-items" modal={false}>
				{ODDS_DISPLAY_SELECT_OPTIONS.map((o) => (
					<Menu.Item key={o.value}>
						{({ focus }) => (
							<button
								type="button"
								className={
									"prediction-calendar-odds-item" +
									(focus ? " prediction-calendar-odds-item--focus" : "") +
									(oddsDisplayStyle === o.value
										? " prediction-calendar-odds-item--selected"
										: "")
								}
								onClick={() => setOddsDisplayStyle(o.value)}
							>
								{o.label}
							</button>
						)}
					</Menu.Item>
				))}
			</Menu.Items>
		</Menu>
	);
}
