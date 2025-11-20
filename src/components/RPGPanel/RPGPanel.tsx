import { useState, useMemo, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { isFeatureEnabled } from "@/config/features";
import { useRPG } from "@/context/RPGContext";
import { triggerFireworksAt } from "@/pages/Positions/utils/Fireworks";
import "./RPGPanel.scss";

interface RPGPanelProps {
	userImageUrl?: string;
}

export function RPGPanel({ userImageUrl }: RPGPanelProps) {
	const [isExpanded, setIsExpanded] = useState(false); // Start closed
	const { authenticated, login, user } = usePrivy();
	const { exp, level, frameAsset, frameName, progress, loading, error } =
		useRPG();

	// Animation state for progress bar
	const [animatedProgress, setAnimatedProgress] = useState(progress.progress);
	const prevExpRef = useRef(exp);
	const animationFrameRef = useRef<number | null>(null);
	const pendingAnimationRef = useRef<{ start: number; end: number } | null>(
		null
	);
	const collapsedIndicatorRef = useRef<HTMLDivElement | null>(null);
	const autoExpandTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const autoCollapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// When exp updates while panel is OPEN -> animate immediately
	// When exp updates while panel is CLOSED -> mark as pending
	useEffect(() => {
		if (loading) {
			setAnimatedProgress(progress.progress);
			prevExpRef.current = exp;
			return;
		}

		const expIncreased = exp > prevExpRef.current;
		prevExpRef.current = exp;

		if (!expIncreased) {
			// No exp increase, just sync if expanded
			if (isExpanded) {
				setAnimatedProgress(progress.progress);
			}
			return;
		}

		// Exp increased
		if (!isExpanded) {
			// Panel is CLOSED - mark as pending and auto-expand
			pendingAnimationRef.current = {
				start: animatedProgress,
				end: progress.progress,
			};

			// Auto-expand the panel
			setIsExpanded(true);

			// Trigger fireworks at the frame position
			setTimeout(() => {
				if (collapsedIndicatorRef.current) {
					// Find the frame element within the panel
					const frameElement =
						collapsedIndicatorRef.current.querySelector(
							".rpg-profile-frame img"
						) ||
						collapsedIndicatorRef.current.querySelector(
							".rpg-frame-container"
						);
					if (frameElement) {
						const rect = frameElement.getBoundingClientRect();
						const cx = rect.left + rect.width / 2;
						const cy = rect.top + rect.height / 2;
						triggerFireworksAt(cx, cy, 1000);
					}
				}
			}, 50);
			return;
		}

		// Panel is OPEN - animate immediately
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
		}

		const startProgress = animatedProgress;
		const endProgress = progress.progress;
		const duration = 2000; // 2 seconds
		const startTime = performance.now();

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progressRatio = Math.min(elapsed / duration, 1);

			if (progressRatio >= 1) {
				setAnimatedProgress(endProgress);
				animationFrameRef.current = null;
				return;
			}

			const eased = 1 - Math.pow(1 - progressRatio, 3);
			const currentProgress =
				startProgress + (endProgress - startProgress) * eased;
			setAnimatedProgress(currentProgress);
			animationFrameRef.current = requestAnimationFrame(animate);
		};

		animationFrameRef.current = requestAnimationFrame(animate);

		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
		};
	}, [exp, progress.progress, loading, isExpanded, animatedProgress]);

	// When panel OPENS and there's a pending animation -> animate it, then auto-close
	useEffect(() => {
		if (!isExpanded || loading || !pendingAnimationRef.current) {
			return;
		}

		const { start, end } = pendingAnimationRef.current;
		pendingAnimationRef.current = null;

		// Set initial value
		setAnimatedProgress(start);

		// Cancel any existing animation or timeouts
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
		}
		if (autoCollapseTimeoutRef.current !== null) {
			clearTimeout(autoCollapseTimeoutRef.current);
		}

		const duration = 2000; // 2 seconds
		const startTime = performance.now();

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progressRatio = Math.min(elapsed / duration, 1);

			if (progressRatio >= 1) {
				setAnimatedProgress(end);
				animationFrameRef.current = null;

				// Auto-close after animation completes
				autoCollapseTimeoutRef.current = setTimeout(() => {
					setIsExpanded(false);
				}, 500); // Wait 500ms after animation, then close
				return;
			}

			const eased = 1 - Math.pow(1 - progressRatio, 3);
			const currentProgress = start + (end - start) * eased;
			setAnimatedProgress(currentProgress);
			animationFrameRef.current = requestAnimationFrame(animate);
		};

		setTimeout(() => {
			animationFrameRef.current = requestAnimationFrame(animate);
		}, 100);

		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
			if (autoCollapseTimeoutRef.current !== null) {
				clearTimeout(autoCollapseTimeoutRef.current);
				autoCollapseTimeoutRef.current = null;
			}
		};
	}, [isExpanded, loading]);

	// Get first letter of email or "?" as fallback
	const profileInitial = useMemo(() => {
		// Check for email from various sources
		const email =
			user?.email?.address ||
			user?.google?.email ||
			user?.twitter?.email ||
			user?.discord?.email ||
			"";

		if (email && email.length > 0) {
			return email.charAt(0).toUpperCase();
		}
		return "?";
	}, [user]);

	// Don't render if feature is disabled
	if (!isFeatureEnabled("RPG")) {
		return null;
	}

	const togglePanel = () => {
		setIsExpanded(!isExpanded);
	};

	const handleSignup = () => {
		if (!authenticated) {
			login();
		}
	};

	return (
		<div
			className={`rpg-panel ${isExpanded ? "expanded" : "collapsed"}`}
			ref={collapsedIndicatorRef}
		>
			{/* Toggle Button */}
			<button
				className="rpg-panel-toggle"
				onClick={togglePanel}
				aria-label={
					isExpanded ? "Collapse RPG Panel" : "Expand RPG Panel"
				}
			>
				{isExpanded ? (
					<span className="rpg-toggle-desktop">◀</span>
				) : (
					<span className="rpg-toggle-desktop">▶</span>
				)}
				<span className="rpg-toggle-mobile">
					{isExpanded ? "▲" : "▼"}
				</span>
			</button>

			{/* Panel Content */}
			<div className="rpg-panel-content">
				{loading ? (
					<div className="rpg-panel-loading">Loading...</div>
				) : error ? (
					<div className="rpg-panel-error">{error}</div>
				) : (
					<div className="rpg-panel-layout">
						{/* Frame on Left - Full Height */}
						<div className="rpg-frame-container">
							<div className="rpg-profile-frame">
								{frameAsset && (
									<img
										src={frameAsset}
										alt={`${frameName} Frame`}
										className="rpg-frame-image"
										onError={(e) => {
											(
												e.target as HTMLImageElement
											).style.display = "none";
										}}
									/>
								)}
							</div>
							<div className="rpg-profile-image-wrapper">
								<div className="rpg-profile-initial">
									{profileInitial}
								</div>
							</div>
						</div>

						{/* Content on Right */}
						<div className="rpg-content-container">
							{/* Experience Bar - 4x frame width, 2/3 height */}
							<div className="rpg-exp-bar-section">
								<div className="rpg-exp-bar-container">
									<div
										className="rpg-exp-bar-fill"
										style={{
											width: `${animatedProgress * 100}%`,
										}}
									/>
									<div className="rpg-exp-bar-text">
										<span>Level {level}</span>
										<span>
											{progress.current} / {progress.next}
										</span>
									</div>
								</div>
							</div>

							{/* Title */}
							<div className="rpg-level-title">{frameName}</div>

							{/* Signup Prompt for Unauthenticated Users */}
							{!authenticated && (
								<div className="rpg-signup-prompt">
									<p className="rpg-signup-text">
										Sign up to save your progress!
									</p>
									<button
										className="rpg-signup-button"
										onClick={handleSignup}
									>
										Sign Up
									</button>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

export default RPGPanel;
