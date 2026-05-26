import React from "react";

interface StatusToggleProps {
	value: boolean;
	onChange: (value: boolean) => void;
	label?: string;
	activeLabel?: string;
	inactiveLabel?: string;
	className?: string;
	buttonClassName?: string;
	activeButtonClassName?: string;
	inactiveButtonClassName?: string;
}

const baseContainerStyle: React.CSSProperties = {
	display: "grid",
	gap: 6,
};

const baseRowStyle: React.CSSProperties = {
	display: "flex",
	gap: 8,
};

const baseButtonStyle: React.CSSProperties = {
	padding: "6px 10px",
	border: "1px solid white",
	borderRadius: 6,
	background: "transparent",
	color: "white",
	cursor: "pointer",
};

function composeButtonStyle(isActive: boolean): React.CSSProperties {
	return {
		...baseButtonStyle,
		background: isActive ? "rgba(255,255,255,0.2)" : "transparent",
	};
}

const StatusToggle: React.FC<StatusToggleProps> = ({
	value,
	onChange,
	label = "Status",
	activeLabel = "Active",
	inactiveLabel = "Inactive",
	className,
	buttonClassName,
	activeButtonClassName,
	inactiveButtonClassName,
}) => {
	const activeClasses = [buttonClassName]
		.concat(value && activeButtonClassName ? [activeButtonClassName] : [])
		.filter(Boolean)
		.join(" ")
		.trim();
	const inactiveClasses = [buttonClassName]
		.concat(!value && inactiveButtonClassName ? [inactiveButtonClassName] : [])
		.filter(Boolean)
		.join(" ")
		.trim();

	return (
		<div className={className} style={className ? undefined : baseContainerStyle}>
			<span>{label}</span>
			<div style={baseRowStyle}>
				<button
					type="button"
					onClick={() => onChange(true)}
					className={activeClasses || undefined}
					style={activeButtonClassName && value ? undefined : composeButtonStyle(value)}
				>
					{activeLabel}
				</button>
				<button
					type="button"
					onClick={() => onChange(false)}
					className={inactiveClasses || undefined}
					style={inactiveButtonClassName && !value ? undefined : composeButtonStyle(!value)}
				>
					{inactiveLabel}
				</button>
			</div>
		</div>
	);
};

export default StatusToggle;
