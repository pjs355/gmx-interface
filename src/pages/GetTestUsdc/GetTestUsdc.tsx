import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useIdentityToken } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { useSignerContext } from "context/SignerContext";
import { referralService } from "@/services/api/referralService";

import Button from "components/Button/Button";

import "./GetTestUsdc.scss";

export function GetTestUsdc() {
	const { getAccessToken, user, ready, authenticated } = usePrivy();
	const { client: smartClient } = useSmartWallets();
	const { identityToken } = useIdentityToken();
	const wallet = useSignerContext();

	// Test USD Claim State
	const [isLoading, setIsLoading] = useState(false);
	const [isCheckingClaim, setIsCheckingClaim] = useState(true);
	const [hasAlreadyClaimed, setHasAlreadyClaimed] = useState(false);

	// Referral State
	const [myReferralCode, setMyReferralCode] = useState<string>("");
	const [referralInput, setReferralInput] = useState<string>("");
	const [hasClaimedReferral, setHasClaimedReferral] = useState(false);
	const [isLoadingReferralStatus, setIsLoadingReferralStatus] =
		useState(true);
	const [isClaimingReferral, setIsClaimingReferral] = useState(false);
	const [referralError, setReferralError] = useState<string>("");
	const [referralSuccess, setReferralSuccess] = useState<string>("");
	const [isCopied, setIsCopied] = useState(false);

	// Resolve API base via shared helper
	const API_ROOT = getPredictionApiBaseUrl();

	// Check test USD claim status
	useEffect(() => {
		let cancelled = false;
		const start = Date.now();

		async function run() {
			try {
				let resolvedAddress;
				while (!cancelled) {
					resolvedAddress = wallet?.account || wallet?.signerAddress;
					if (resolvedAddress || Date.now() - start > 5000) break;
					await new Promise((r) => setTimeout(r, 200));
				}

				if (!resolvedAddress) {
					console.log("No wallet address found");
					if (!cancelled) setIsCheckingClaim(false);
					return;
				}

				const token = await getAccessToken();
				if (!token) return;

				if (!identityToken) {
					if (!cancelled) setIsCheckingClaim(false);
					return;
				}

				const res = await fetch(`${API_ROOT}/test-coins/check-claim`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
						"privy-id-token": identityToken,
					},
					body: JSON.stringify({
						smartWallet: resolvedAddress,
					}),
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

				if (!cancelled) setHasAlreadyClaimed(claimed);
			} catch (error) {
				console.error("error", error);
			} finally {
				if (!cancelled) setIsCheckingClaim(false);
			}
		}

		run();
		return () => {
			cancelled = true;
		};
	}, [
		getAccessToken,
		user?.linkedAccounts,
		smartClient,
		wallet?.account,
		wallet?.signerAddress,
		API_ROOT,
		identityToken,
	]);

	// Load referral data
	useEffect(() => {
		let cancelled = false;

		async function loadReferralData() {
			// Wait for Privy to be ready and user to be authenticated
			if (!ready || !authenticated) {
				return;
			}

			// Wait for identity token to be available
			if (!identityToken) {
				return;
			}

			try {
				const token = await getAccessToken();
				if (!token) {
					return;
				}

				if (!identityToken) {
					throw new Error("No identity token available");
				}

				// Get my referral code
				const code = await referralService.getReferralCode(
					token,
					identityToken
				);
				if (!cancelled) setMyReferralCode(code);

				// Check if already claimed referral
				const status = await referralService.getReferralStatus(
					token,
					identityToken
				);
				if (!cancelled) setHasClaimedReferral(status.hasClaimed);
			} catch (error) {
				console.error("error", error);
			} finally {
				if (!cancelled) setIsLoadingReferralStatus(false);
			}
		}

		loadReferralData();
		return () => {
			cancelled = true;
		};
	}, [getAccessToken, ready, authenticated, identityToken]);

	const handleClaimClick = async () => {
		try {
			setIsLoading(true);
			const token = await getAccessToken();
			const smartWallet = wallet?.account || wallet?.signerAddress;

			if (!smartWallet) {
				console.error("No wallet address available for claiming");
				return;
			}

			if (!identityToken) {
				console.error("No identity token available for claiming");
				return;
			}

			console.log("Sending claim request with address:", smartWallet);

			const response = await fetch(`${API_ROOT}/test-coins/claim`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
					"privy-id-token": identityToken,
				},
				body: JSON.stringify({
					smartWallet,
				}),
			});
			const text = await response.text();
			console.log(
				"/api/test-coins/claim response:",
				response.status,
				text
			);
		} catch (error) {
			console.error("Claim request failed:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleCopyReferralCode = async () => {
		try {
			await navigator.clipboard.writeText(myReferralCode);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		} catch (error) {
			console.error("error", error);
		}
	};

	const handleClaimReferral = async () => {
		if (!referralInput.trim()) {
			setReferralError("Please enter a referral code");
			return;
		}

		if (referralInput.trim().length !== 12) {
			setReferralError("Referral code must be 12 characters");
			return;
		}

		if (!identityToken) {
			setReferralError("Authentication error. Please try again.");
			return;
		}

		setReferralError("");
		setReferralSuccess("");
		setIsClaimingReferral(true);

		try {
			const token = await getAccessToken();
			if (!token) {
				throw new Error("No access token");
			}

			const result = await referralService.claimReferralBonus(
				token,
				identityToken,
				referralInput.trim()
			);

			setReferralSuccess(
				`Success! You and your referrer each received ${result.data.claimantBonus} coins!`
			);
			setHasClaimedReferral(true);
			setReferralInput("");
		} catch (error: any) {
			console.error("error", error);
			setReferralError(error.message || "Failed to claim referral bonus");
		} finally {
			setIsClaimingReferral(false);
		}
	};

	const getButtonText = () => {
		if (isCheckingClaim) return "Checking...";
		if (hasAlreadyClaimed) return "Already Claimed";
		if (isLoading) return "Processing...";
		return "Claim Test USD";
	};

	const isButtonDisabled = isLoading || isCheckingClaim || hasAlreadyClaimed;

	return (
		<div className="GetTestUsdc">
			<div className="GetTestUsdc-content">
				<div className="GetTestUsdc-cards">
					{/* Test USD Claim Card - Now handled by banner */}
					{/* <div className="GetTestUsdc-card">
						<h2 className="GetTestUsdc-card-title">
							Get $500 of Test USD
						</h2>
						<div className="GetTestUsdc-button-container">
							<Button
								variant="primary"
								onClick={handleClaimClick}
								className="GetTestUsdc-claim-button"
								disabled={isButtonDisabled}
							>
								{getButtonText()}
							</Button>
						</div>
					</div> */}

					{/* Referral Card */}
					<div className="GetTestUsdc-card">
						<h2 className="GetTestUsdc-card-title">
							Get More Test USD
						</h2>

						{/* My Referral Code */}
						<div className="GetTestUsdc-referral-section">
							<label className="GetTestUsdc-label">
								Your Referral Code
							</label>
							<div className="GetTestUsdc-code-container">
								<pre className="GetTestUsdc-code-display">
									{myReferralCode || "Loading..."}
								</pre>
								<Button
									variant="secondary"
									onClick={handleCopyReferralCode}
									className="GetTestUsdc-copy-button"
									disabled={!myReferralCode}
								>
									{isCopied ? "Copied!" : "Copy"}
								</Button>
							</div>
							<p className="GetTestUsdc-hint">
								Share to earn $100!
							</p>
						</div>

						{/* Claim Referral Bonus */}
						{!hasClaimedReferral && !isLoadingReferralStatus && (
							<div className="GetTestUsdc-referral-section">
								<label className="GetTestUsdc-label">
									Have a referral code?
								</label>
								<div className="GetTestUsdc-input-container">
									<input
										type="text"
										value={referralInput}
										onChange={(e) =>
											setReferralInput(
												e.target.value.toUpperCase()
											)
										}
										placeholder="Enter code..."
										maxLength={12}
										className="GetTestUsdc-referral-input"
									/>
									<Button
										variant="primary"
										onClick={handleClaimReferral}
										className="GetTestUsdc-claim-button"
										disabled={
											isClaimingReferral ||
											!referralInput.trim()
										}
									>
										{isClaimingReferral
											? "Claiming..."
											: "Claim Bonus"}
									</Button>
								</div>
								<p className="GetTestUsdc-hint">
									You and your referrer get $100 each!
								</p>
								{referralError && (
									<div className="GetTestUsdc-error">
										{referralError}
									</div>
								)}
								{referralSuccess && (
									<div className="GetTestUsdc-success">
										{referralSuccess}
									</div>
								)}
							</div>
						)}

						{hasClaimedReferral && (
							<div className="GetTestUsdc-referral-section">
								<p className="GetTestUsdc-success">
									✓ You've already claimed a referral bonus!
								</p>
							</div>
						)}
					</div>
				</div>

				<div className="GetTestUsdc-disclosure">
					<p>
						This is FAKE USD and it has ZERO real world value or use
						case. It can not be redeemed for anything of value. It
						is just for testing and funding purposes.
					</p>
				</div>
			</div>
		</div>
	);
}

export default GetTestUsdc;
