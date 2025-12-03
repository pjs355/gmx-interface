/**
 * AmountInput Component
 * Reusable currency amount input with symbol
 */

import React from "react";
import type { FiatCurrency } from "../../types";
import { CURRENCY_SYMBOLS } from "../../constants";

interface AmountInputProps {
	value: string;
	onChange: (value: string) => void;
	currency?: FiatCurrency;
	label?: string;
	placeholder?: string;
	disabled?: boolean;
	min?: number;
	step?: number;
}

export function AmountInput({
	value,
	onChange,
	currency = "usd",
	label = "Amount",
	placeholder = "0.00",
	disabled = false,
	min = 0.01,
	step = 0.01,
}: AmountInputProps) {
	return (
		<div className="input-group">
			<label>{label}</label>
			<div className="input-with-icon">
				<span className="currency-symbol">{CURRENCY_SYMBOLS[currency]}</span>
				<input
					type="number"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					disabled={disabled}
					min={min}
					step={step}
				/>
			</div>
		</div>
	);
}

