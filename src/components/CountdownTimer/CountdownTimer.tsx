import { useEffect, useMemo, useState } from "react";

interface CountdownTimerProps {
	target: Date | string | number | null | undefined;
	prefix?: string;
	suffix?: string;
	className?: string;
	expiredLabel?: string;
	showZeroDays?: boolean;
}

const DEFAULT_EXPIRED = "Expired";

function normalizeTarget(target: CountdownTimerProps["target"]): number | null {
	if (target === null || target === undefined) {
		return null;
	}
	if (target instanceof Date) {
		return target.getTime();
	}
	if (typeof target === "number") {
		return target;
	}
	if (typeof target === "string") {
		const parsed = Date.parse(target);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

function formatDuration(diffMs: number, showZeroDays: boolean): string {
	let totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
	const days = Math.floor(totalSeconds / 86400);
	totalSeconds -= days * 86400;
	const hours = Math.floor(totalSeconds / 3600);
	totalSeconds -= hours * 3600;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds - minutes * 60;

	const parts: string[] = [];
	if (days > 0 || showZeroDays) {
		parts.push(`${days}d`);
	}
	if (parts.length > 0 || hours > 0) {
		parts.push(`${hours}h`);
	}
	if (parts.length > 0 || minutes > 0) {
		parts.push(`${minutes}m`);
	}
	parts.push(`${seconds}s`);

	return parts.join(" ");
}

export default function CountdownTimer({
	target,
	prefix,
	suffix,
	className,
	expiredLabel = DEFAULT_EXPIRED,
	showZeroDays = false,
}: CountdownTimerProps) {
	const targetMs = useMemo(() => normalizeTarget(target), [target]);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (targetMs === null) {
			return;
		}
		const tick = () => {
			setNow(Date.now());
		};

		const interval = setInterval(tick, 1000);
		tick();
		return () => clearInterval(interval);
	}, [targetMs]);

	if (targetMs === null) {
		return (
			<span className={className}>
				{prefix ? `${prefix} ` : ""}
				{expiredLabel}
				{suffix ? ` ${suffix}` : ""}
			</span>
		);
	}

	const diff = targetMs - now;
	const isExpired = diff <= 0;

	const content = isExpired ? expiredLabel : formatDuration(diff, showZeroDays);

	return (
		<span className={className}>
			{prefix ? `${prefix} ` : ""}
			{content}
			{suffix ? ` ${suffix}` : ""}
		</span>
	);
}
