import type { ComponentProps } from "react";
import { Menu } from "@headlessui/react";
import { PiSlidersHorizontal } from "react-icons/pi";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { ODDS_DISPLAY_SELECT_OPTIONS } from "@/features/odds-display/oddsDisplayFormat";

type MenuItemsAnchor = ComponentProps<typeof Menu.Items>["anchor"];

export type OddsFormatMenuProps = {
	/** Root element classes (e.g. layout wrapper from parent). */
	className?: string;
	iconSize?: number;
	/**
	 * Headless UI anchor — portals the popover to <body> and float-positions
	 * it, so it never gets clipped inside an `overflow` scroll container (the
	 * cause of the popover "freezing" invisibly inside the mobile filter row).
	 */
	anchor?: MenuItemsAnchor;
};

/**
 * Headless UI odds-format picker — same persistence as Profile (`OddsDisplayContext`).
 */
export default function OddsFormatMenu({
	className = "",
	iconSize = 22,
	anchor = { to: "bottom end", gap: 6 },
}: OddsFormatMenuProps) {
	const { oddsDisplayStyle, setOddsDisplayStyle } = useOddsDisplay();

	return (
		<Menu as="div" className={`odds-format-menu ${className}`.trim()}>
			<Menu.Button type="button" className="odds-format-menu__trigger" aria-label="Odds display">
				<PiSlidersHorizontal size={iconSize} aria-hidden />
			</Menu.Button>
			<Menu.Items className="odds-format-menu__items" modal={false} anchor={anchor}>
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
