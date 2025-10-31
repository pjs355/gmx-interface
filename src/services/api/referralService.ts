import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

export interface ReferralCodeResponse {
	success: boolean;
	referralCode: string;
}

export interface ReferralStatusResponse {
	success: boolean;
	hasClaimed: boolean;
	referredBy?: string;
	claimedAt?: string;
}

export interface ReferralClaimResponse {
	success: boolean;
	message: string;
	data: {
		claimantBonus: number;
		referrerBonus: number;
		claimantTxHash: string;
		referrerTxHash: string;
	};
}

export const referralService = {
	async getReferralCode(
		accessToken: string,
		identityToken: string
	): Promise<string> {
		const baseUrl = getPredictionApiBaseUrl();
		const response = await fetch(`${baseUrl}/referrals/code`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"privy-id-token": identityToken,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to get referral code: ${response.status}`);
		}

		const data: ReferralCodeResponse = await response.json();
		if (!data.success) {
			throw new Error("Failed to retrieve referral code");
		}

		return data.referralCode;
	},

	async getReferralStatus(
		accessToken: string,
		identityToken: string
	): Promise<ReferralStatusResponse> {
		const baseUrl = getPredictionApiBaseUrl();
		const response = await fetch(`${baseUrl}/referrals/status`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"privy-id-token": identityToken,
			},
		});

		if (!response.ok) {
			throw new Error(
				`Failed to get referral status: ${response.status}`
			);
		}

		const data: ReferralStatusResponse = await response.json();
		return data;
	},

	async claimReferralBonus(
		accessToken: string,
		identityToken: string,
		referralCode: string
	): Promise<ReferralClaimResponse> {
		const baseUrl = getPredictionApiBaseUrl();
		const response = await fetch(`${baseUrl}/referrals/claim`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
				"privy-id-token": identityToken,
			},
			body: JSON.stringify({ referralCode }),
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(
				data.error || `Failed to claim referral: ${response.status}`
			);
		}

		return data;
	},
};
