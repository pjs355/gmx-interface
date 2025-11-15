import React, { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignerContext } from "@/context/SignerContext";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import "./CountdownBanner.scss";

interface TimeLeft {
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
}

export function CountdownBanner() {
	const { getAccessToken } = usePrivy();
	const { account, authenticated } = useSignerContext();
	const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
	const [hasClaimedTestUsdc, setHasClaimedTestUsdc] = useState(false);
	const [isCheckingClaim, setIsCheckingClaim] = useState(true);

	// Check if user has claimed test USDC
	useEffect(() => {
		let cancelled = false;

		async function checkClaim() {
			if (!account) {
				if (!cancelled) setIsCheckingClaim(false);
				return;
			}

			try {
				const token = await getAccessToken();
				if (!token) return;

				const API_ROOT = getPredictionApiBaseUrl();
				const res = await fetch(`${API_ROOT}/test-coins/check-claim`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ smartWallet: account }),
				});

				let claimed = false;
				try {
					const data = await res.clone().json();
					claimed = Boolean(
						data?.claimed ??
							data?.hasClaimed ??
							data?.alreadyClaimed ??
							data?.result?.claimed
					);
				} catch {
					const text = await res.text();
					claimed = /true|already/i.test(text);
				}

				if (!cancelled) setHasClaimedTestUsdc(claimed);
			} catch (error) {
				console.error("Error checking test USDC claim:", error);
			} finally {
				if (!cancelled) setIsCheckingClaim(false);
			}
		}

		checkClaim();
		return () => {
			cancelled = true;
		};
	}, [account, getAccessToken]);

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

	// Don't show banner until we've checked claim status
	if (isCheckingClaim) {
		return null;
	}

	// Only show banner if user HAS claimed test USDC
	if (!hasClaimedTestUsdc) {
		return null;
	}

	// Don't show banner if countdown has ended
	if (!timeLeft) {
		return null;
	}

	return (
		<div className="countdown-banner">
			<div className="countdown-banner-container">
				<div className="countdown-banner-content">
					<h3 className="countdown-banner-title">
						Time left to win a Nintendo Switch 2
					</h3>
				</div>
				<div className="countdown-timer">
					<div className="time-unit">
						<div className="time-value">{timeLeft.days}</div>
						<div className="time-label">D</div>
					</div>
					<div className="time-separator">:</div>
					<div className="time-unit">
						<div className="time-value">
							{String(timeLeft.hours).padStart(2, "0")}
						</div>
						<div className="time-label">H</div>
					</div>
					<div className="time-separator">:</div>
					<div className="time-unit">
						<div className="time-value">
							{String(timeLeft.minutes).padStart(2, "0")}
						</div>
						<div className="time-label">M</div>
					</div>
					<div className="time-separator">:</div>
					<div className="time-unit">
						<div className="time-value">
							{String(timeLeft.seconds).padStart(2, "0")}
						</div>
						<div className="time-label">S</div>
					</div>
				</div>
			</div>
		</div>
	);
}

