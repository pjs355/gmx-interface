import React, { useRef } from "react";

interface EventScheduleSectionProps {
	isEvent: boolean;
	onToggle: (value: boolean) => void;
	eventDate: string;
	endDate: string;
	onEventDateChange: (value: string) => void;
	onEndDateChange: (value: string) => void;
	className?: string;
	buttonClassName?: string;
	activeButtonClassName?: string;
	inactiveButtonClassName?: string;
	showClearButtons?: boolean;
	onClearEventDate?: () => void;
	onClearEndDate?: () => void;
}

const containerStyle: React.CSSProperties = {
	display: "grid",
	gap: 6,
};

const buttonRowStyle: React.CSSProperties = {
	display: "flex",
	gap: 8,
};

const buttonStyle: React.CSSProperties = {
	padding: "6px 10px",
	border: "1px solid white",
	borderRadius: 6,
	background: "transparent",
	color: "white",
	cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
	padding: 8,
	color: "cyan",
	border: "1px solid white",
	borderRadius: 4,
	background: "transparent",
};

const smallButtonStyle: React.CSSProperties = {
	...buttonStyle,
	whiteSpace: "nowrap",
};

function composeToggleStyle(isActive: boolean): React.CSSProperties {
	return {
		...buttonStyle,
		background: isActive ? "rgba(255,255,255,0.2)" : "transparent",
	};
}

const EventScheduleSection: React.FC<EventScheduleSectionProps> = ({
	isEvent,
	onToggle,
	eventDate,
	endDate,
	onEventDateChange,
	onEndDateChange,
	className,
	buttonClassName,
	activeButtonClassName,
	inactiveButtonClassName,
	showClearButtons = false,
	onClearEventDate,
	onClearEndDate,
}) => {
	const eventInputRef = useRef<HTMLInputElement | null>(null);
	const endInputRef = useRef<HTMLInputElement | null>(null);

	const openPicker = (ref: React.RefObject<HTMLInputElement>) => {
		try {
			// @ts-ignore showPicker is not yet in the TS lib
			ref.current?.showPicker?.();
		} catch {
			ref.current?.focus();
		}
	};

	const activeClasses = [buttonClassName]
		.concat(isEvent && activeButtonClassName ? [activeButtonClassName] : [])
		.filter(Boolean)
		.join(" ")
		.trim();
	const inactiveClasses = [buttonClassName]
		.concat(!isEvent && inactiveButtonClassName ? [inactiveButtonClassName] : [])
		.filter(Boolean)
		.join(" ")
		.trim();

	return (
		<div className={className} style={className ? undefined : containerStyle}>
			<span>Is this part of an event?</span>
			<div style={buttonRowStyle}>
				<button
					type="button"
					onClick={() => onToggle(false)}
					className={inactiveClasses || undefined}
					style={inactiveButtonClassName && !isEvent ? undefined : composeToggleStyle(!isEvent)}
				>
					No
				</button>
				<button
					type="button"
					onClick={() => onToggle(true)}
					className={activeClasses || undefined}
					style={activeButtonClassName && isEvent ? undefined : composeToggleStyle(isEvent)}
				>
					Yes
				</button>
			</div>
			{isEvent && (
				<>
					<label style={{ display: "grid", gap: 6 }}>
						<span>Event Start Date & Time</span>
						<div
							style={{
								display: "flex",
								gap: 8,
								alignItems: "center",
							}}
						>
							<input
								type="datetime-local"
								ref={eventInputRef}
								value={eventDate}
								onChange={(e) => onEventDateChange(e.target.value)}
								style={inputStyle}
							/>
							<button
								type="button"
								onClick={() => openPicker(eventInputRef)}
								style={smallButtonStyle}
							>
								Pick
							</button>
							{showClearButtons && (
								<button
									type="button"
									onClick={() => (onClearEventDate ? onClearEventDate() : onEventDateChange(""))}
									style={smallButtonStyle}
								>
									Clear
								</button>
							)}
						</div>
					</label>
					<label style={{ display: "grid", gap: 6 }}>
						<span>Event End Date & Time</span>
						<div
							style={{
								display: "flex",
								gap: 8,
								alignItems: "center",
							}}
						>
							<input
								type="datetime-local"
								ref={endInputRef}
								value={endDate}
								min={eventDate || undefined}
								onChange={(e) => onEndDateChange(e.target.value)}
								style={inputStyle}
							/>
							<button
								type="button"
								onClick={() => openPicker(endInputRef)}
								style={smallButtonStyle}
							>
								Pick
							</button>
							{showClearButtons && (
								<button
									type="button"
									onClick={() => (onClearEndDate ? onClearEndDate() : onEndDateChange(""))}
									style={smallButtonStyle}
								>
									Clear
								</button>
							)}
						</div>
					</label>
				</>
			)}
		</div>
	);
};

export default EventScheduleSection;
