import { usePrivy } from "@privy-io/react-auth";
import { useIdentityToken } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { referralService } from "@/services/api/referralService";

import Button from "components/Button/Button";

import "./GetTestUsdc.scss";

export function GetTestUsdc() {
	const { getAccessToken, ready, authenticated } = usePrivy();
	const { identityToken } = useIdentityToken();

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

	return (
		<div className="GetTestUsdc">
			<div className="GetTestUsdc-content">
				<div className="GetTestUsdc-cards">
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
