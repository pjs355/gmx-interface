import { Menu } from "@headlessui/react";
import { PiSlidersHorizontal } from "react-icons/pi";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { ODDS_DISPLAY_SELECT_OPTIONS } from "@/features/odds-display/oddsDisplayFormat";

export type OddsFormatMenuProps = {
	/** Root element classes (e.g. layout wrapper from parent). */
	className?: string;
	iconSize?: number;
};

/**
 * Headless UI odds-format picker — same persistence as Profile (`OddsDisplayContext`).
 */
export default function OddsFormatMenu({ className = "", iconSize = 22 }: OddsFormatMenuProps) {
	const { oddsDisplayStyle, setOddsDisplayStyle } = useOddsDisplay();

	return (
		<Menu as="div" className={`odds-format-menu ${className}`.trim()}>
			<Menu.Button type="button" className="odds-format-menu__trigger" aria-label="Odds display">
				<PiSlidersHorizontal size={iconSize} aria-hidden />
			</Menu.Button>
			<Menu.Items className="odds-format-menu__items" modal={false}>
				{ODDS_DISPLAY_SELECT_OPTIONS.map((o) => (
					<Menu.Item key={o.value}>
						{({ focus }) => (
							<button
								type="button"
								className={
									"odds-format-menu__item" +
									(focus ? " odds-format-menu__item--focus" : "") +
									(oddsDisplayStyle === o.value ? " odds-format-menu__item--selected" : "")
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
