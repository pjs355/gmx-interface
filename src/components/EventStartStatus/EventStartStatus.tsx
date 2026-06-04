import { useEffect, useMemo, useState } from "react";
import CountdownTimer from "@/components/CountdownTimer/CountdownTimer";
import {
	formatEventStartDisplay,
	shouldShowEventStartCountdown,
} from "@/pages/Predictions/utils/eventDates";

interface EventStartStatusProps {
	target: Date | string | number | null | undefined;
	className?: string;
	prefix?: string;
	expiredLabel?: string;
	showZeroDays?: boolean;
	/**
	 * When the event is already in the past: show the local kickoff date/time,
	 * the expired label, or nothing. Trading chart uses "date" for post-kickoff.
	 */
	whenPast?: "date" | "label" | "hidden";
}

function normalizeTarget(target: EventStartStatusProps["target"]): Date | null {
	if (target === null || target === undefined) {
		return null;
	}
	if (target instanceof Date) {
		return Number.isNaN(target.getTime()) ? null : target;
	}
	if (typeof target === "number") {
		if (!Number.isFinite(target)) return null;
		return new Date(target);
	}
	if (typeof target === "string") {
		const parsed = Date.parse(target);
		return Number.isNaN(parsed) ? null : new Date(parsed);
	}
	return null;
}

export default function EventStartStatus({
	target,
	className,
	prefix = "Starts In:",
	expiredLabel = "Ended",
	showZeroDays = false,
	whenPast = "label",
}: EventStartStatusProps) {
	const eventDate = useMemo(() => normalizeTarget(target), [target]);
	const eventMs = eventDate?.getTime() ?? null;
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (eventMs === null) return;
		const diff = eventMs - Date.now();
		// Static date label when far out; tick only inside the 24h countdown window.
		if (diff > 24 * 60 * 60 * 1000) return;
		const interval = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(interval);
	}, [eventMs]);

	if (eventDate === null) {
		return null;
	}

	const diff = eventMs! - now;
	if (diff <= 0) {
		if (whenPast === "hidden") return null;
		if (whenPast === "date") {
			return <span className={className}>{formatEventStartDisplay(eventDate)}</span>;
		}
		return (
			<span className={className}>
				{expiredLabel}
			</span>
		);
	}

	if (!shouldShowEventStartCountdown(eventDate, now)) {
		return <span className={className}>{formatEventStartDisplay(eventDate)}</span>;
	}

	return (
		<CountdownTimer
			target={eventDate}
			className={className}
			prefix={prefix}
			expiredLabel={expiredLabel}
			showZeroDays={showZeroDays}
		/>
	);
}
