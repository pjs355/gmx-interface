import React, { useState } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useSignerContext } from "@/context/SignerContext";
import { useUserData } from "@/context/UserDataContext";
import { useRPG } from "@/context/RPGContext";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { toast } from "react-toastify";
import "./ProgressBanner.scss";

export function ProgressBanner() {
	const { getAccessToken } = usePrivy();
	const { identityToken } = useIdentityToken();
	const { account, authenticated } = useSignerContext();
	const wallet = useSignerContext();
	const { refresh: refreshUserData } = useUserData();
	const { profile, loading: rpgLoading, refresh: refreshRPG } = useRPG();
	const [isClaiming, setIsClaiming] = useState(false);

	// Use profile from RPGContext - hasClaimedTestUsdc checks claimedwallets collection
	const hasClaimedTestUsdc = (profile as any)?.hasClaimedTestUsdc ?? false;

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

			if (!identityToken) {
				console.error("No identity token available for claiming");
				toast.error("Authentication error. Please try again.");
				return;
			}

			const API_ROOT = getPredictionApiBaseUrl();
			const response = await fetch(`${API_ROOT}/test-coins/claim`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
					"privy-id-token": identityToken,
				},
				body: JSON.stringify({ smartWallet }),
			});
			const text = await response.text();

			if (response.ok) {
				// Refresh user data to update the cash balance in the header
				await refreshUserData();
				
				// Refresh RPG state to update profile
				await refreshRPG();
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

	// Don't show banner if user is not authenticated
	if (!authenticated || !account) {
		return null;
	}

	// If user has already claimed, don't show the banner
	if (hasClaimedTestUsdc) {
		return null;
	}

	// Show banner (with skeleton if still loading)
	return (
		<div className={`progress-banner ${rpgLoading ? 'progress-banner--loading' : 'progress-banner--loaded'}`}>
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
					disabled={isClaiming || rpgLoading}
				>
					{isClaiming ? "Claiming..." : "Claim Test $"}
				</button>
			</div>
		</div>
	);
}
