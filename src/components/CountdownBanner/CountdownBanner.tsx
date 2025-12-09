import React, { useEffect, useState } from "react";
import { useSignerContext } from "@/context/SignerContext";
import { useRPG } from "@/context/RPGContext";
import "./CountdownBanner.scss";

interface TimeLeft {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
}

export function CountdownBanner() {
	const { account, authenticated } = useSignerContext();
	const { profile, loading: rpgLoading } = useRPG();
	const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

	// Use profile from RPGContext - hasClaimedTestUsdc checks claimedwallets collection
	const hasClaimedTestUsdc = (profile as any)?.hasClaimedTestUsdc ?? false;

	useEffect(() => {
		const calculateTimeLeft = (): TimeLeft | null => {
			// Set target date to December 15th, 2025 at 11:59:59 PM
			const targetDate = new Date("2025-12-15T23:59:59");
			const now = new Date();
			const difference = targetDate.getTime() - now.getTime();

			if (difference <= 0) {
				return null; // Countdown has ended
			}

			return {
				days: Math.floor(difference / (1000 * 60 * 60 * 24)),
				hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
				minutes: Math.floor((difference / 1000 / 60) % 60),
				seconds: Math.floor((difference / 1000) % 60),
			};
		};

		// Initial calculation
		setTimeLeft(calculateTimeLeft());

		// Update every second
		const timer = setInterval(() => {
			setTimeLeft(calculateTimeLeft());
		}, 1000);

		return () => clearInterval(timer);
	}, []);

	// Don't show banner if user is not authenticated
	if (!authenticated || !account) {
		return null;
	}

	// Only show banner if user HAS claimed test USDC
	if (!rpgLoading && !hasClaimedTestUsdc) {
		return null;
	}

	// Don't show banner if countdown has ended (only if we're done loading)
	if (!rpgLoading && !timeLeft) {
		return null;
	}

	// Show placeholder values while loading
	const displayTime = timeLeft || { days: 0, hours: 0, minutes: 0, seconds: 0 };

	return (
		<div className={`countdown-banner ${rpgLoading ? 'countdown-banner--loading' : 'countdown-banner--loaded'}`}>
			<div className="countdown-banner-container">
				<div className="countdown-banner-content">
					<h3 className="countdown-banner-title">
						Time left to win a Nintendo Switch 2
					</h3>
				</div>
				<div className="countdown-timer">
					<div className="time-unit">
						<div className="time-value">{displayTime.days}</div>
						<div className="time-label">D</div>
					</div>
					<div className="time-separator">:</div>
					<div className="time-unit">
						<div className="time-value">
							{String(displayTime.hours).padStart(2, "0")}
						</div>
						<div className="time-label">H</div>
					</div>
					<div className="time-separator">:</div>
					<div className="time-unit">
						<div className="time-value">
							{String(displayTime.minutes).padStart(2, "0")}
						</div>
						<div className="time-label">M</div>
					</div>
					<div className="time-separator">:</div>
					<div className="time-unit">
						<div className="time-value">
							{String(displayTime.seconds).padStart(2, "0")}
						</div>
						<div className="time-label">S</div>
					</div>
				</div>
			</div>
		</div>
	);
}
