/**
 * QuickAmounts Component
 * Preset amount buttons for quick selection
 */

import React from "react";
import { QUICK_DEPOSIT_AMOUNTS, QUICK_PERCENTAGE_OPTIONS } from "../../constants";

interface QuickAmountsProps {
	onSelect: (amount: string) => void;
	mode?: "fixed" | "percentage";
	balance?: number;
	amounts?: number[];
}

export function QuickAmounts({
	onSelect,
	mode = "fixed",
	balance = 0,
	amounts,
}: QuickAmountsProps) {
	if (mode === "fixed") {
		const displayAmounts = amounts || QUICK_DEPOSIT_AMOUNTS;
		return (
			<div className="quick-amounts">
				{displayAmounts.map((val) => (
					<button
						key={val}
						className="quick-amount-btn"
						onClick={() => onSelect(val.toString())}
					>
						${val}
					</button>
				))}
			</div>
		);
	}

	// Percentage mode
	return (
		<div className="quick-amounts">
			{QUICK_PERCENTAGE_OPTIONS.map((pct) => (
				<button
					key={pct}
					className="quick-amount-btn"
					onClick={() => onSelect((balance * (pct / 100)).toFixed(2))}
				>
					{pct === 100 ? "Max" : `${pct}%`}
				</button>
			))}
		</div>
	);
}

