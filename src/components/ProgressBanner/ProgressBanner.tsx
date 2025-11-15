import React, { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignerContext } from "@/context/SignerContext";
import { useUserData } from "@/context/UserDataContext";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { toast } from "react-toastify";
import "./ProgressBanner.scss";

export function ProgressBanner() {
	const { getAccessToken } = usePrivy();
	const { account, authenticated } = useSignerContext();
	const wallet = useSignerContext();
	const { refresh: refreshUserData } = useUserData();
	const [hasClaimedTestUsdc, setHasClaimedTestUsdc] = useState(false);
	const [isCheckingClaim, setIsCheckingClaim] = useState(true);
	const [isClaiming, setIsClaiming] = useState(false);

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

	// Don't show banner if user is not authenticated
	if (!authenticated || !account) {
		return null;
	}

	// Don't show banner until data is loaded
	if (isCheckingClaim) {
		return null;
	}

	// If user has already claimed, don't show the banner
	if (hasClaimedTestUsdc) {
		return null;
	}

	const handleClaimClick = async () => {
		try {
			setIsClaiming(true);
			const token = await getAccessToken();
			const smartWallet = wallet?.account || wallet?.signerAddress;

			if (!smartWallet) {
				console.error("No wallet address available for claiming");
				toast.error("No wallet address available for claiming");
				return;
			}

			console.log("Sending claim request with address:", smartWallet);

			const API_ROOT = getPredictionApiBaseUrl();
			const response = await fetch(`${API_ROOT}/test-coins/claim`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ smartWallet }),
			});
			const text = await response.text();
			console.log(
				"/api/test-coins/claim response:",
				response.status,
				text
			);

			// Trigger a re-check on success
			if (response.ok) {
				// Mark as claimed and let the banner disappear
				setHasClaimedTestUsdc(true);
				// Refresh user data to update the cash balance in the header
				await refreshUserData();
			} else {
				toast.error(`Failed to claim: ${text}`);
			}
		} catch (error) {
			console.error("Claim request failed:", error);
			toast.error("Failed to claim test USD. Please try again.");
		} finally {
			setIsClaiming(false);
		}
	};

	return (
		<div className="progress-banner">
			<div className="progress-banner-container">
				<div className="progress-banner-content">
					<div className="progress-banner-subtitle">Welcome to LevelUp!</div>
					<h3 className="progress-banner-title">
						Claim your $500 of test USD to start trading.
					</h3>
				</div>
				<button
					className="progress-banner-button"
					onClick={handleClaimClick}
					disabled={isClaiming}
				>
					{isClaiming ? "Claiming..." : "Claim Test $"}
				</button>
			</div>
		</div>
	);
}

