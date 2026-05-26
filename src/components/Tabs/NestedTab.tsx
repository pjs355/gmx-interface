import { t } from "@lingui/macro";
import cx from "classnames";
import { BiChevronDown } from "react-icons/bi";
import { useState, useRef, useEffect } from "react";

import { NestedOption } from "./types";

type Props<V extends string | number> = {
	option: NestedOption<V>;
	selectedValue: V | undefined;
	commonOptionClassname?: string;
	onOptionClick: ((value: V) => void) | undefined;
	qa?: string;
};

export default function NestedTab<V extends string | number>({
	option,
	selectedValue,
	commonOptionClassname,
	onOptionClick,
	qa,
}: Props<V>) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const selectedSubOption = option.options.find((opt) => opt.value === selectedValue);
	const label = selectedSubOption
		? selectedSubOption.label || selectedSubOption.value
		: option.label || t`More`;

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	return (
		<div className="Tab-option flex items-center justify-center gap-8">
			<div
				ref={dropdownRef}
				className={cx(
					"flex cursor-pointer items-center justify-center text-white relative",
					commonOptionClassname,
				)}
				data-qa={qa ? `${qa}-tab-${option.label}` : undefined}
				onClick={() => setIsOpen(!isOpen)}
				style={{ position: "relative", display: "inline-flex" }}
			>
				{label}

				<BiChevronDown
					size={16}
					style={{
						transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
						transition: "transform 0.2s ease-in-out",
					}}
				/>

				{isOpen && (
					<div
						className="absolute z-[1105] rounded-lg border border-gray-800 bg-black outline-none trade-mode-menu"
						style={{
							backgroundColor: "black",
							borderRadius: 8,
							paddingTop: 2,
							paddingBottom: 2,
							width: "auto",
							minWidth: "100%",
							whiteSpace: "nowrap",
							left: "50%",
							transform: "translateX(-50%)",
							top: "100%",
						}}
					>
						{option.options.map((subOpt) => {
							return (
								<div
									key={subOpt.value}
									data-qa-venue={qa === "trade-venue" ? String(subOpt.value) : undefined}
									className={cx(
										"text-body-medium cursor-pointer text-white hover:text-white trade-mode-menu-item",
										{ "text-white": subOpt.value === selectedValue },
									)}
									style={{
										color: "white",
										display: "flex",
										alignItems: "center",
										paddingTop: 8,
										paddingBottom: 8,
										paddingLeft: 12,
										paddingRight: 12,
										borderRadius: 4,
									}}
									onClick={() => {
										onOptionClick?.(subOpt.value);
										setIsOpen(false);
									}}
								>
									{subOpt.label ?? subOpt.value}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
