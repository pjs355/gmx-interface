import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

const API_BASE = getPredictionApiBaseUrl();

export interface UserProfile {
	_id: string; // MongoDB ObjectId (as string on client)
	userId: string; // Privy user ID
	exp?: number;
	username?: string;
	usernameLower?: string;
	usernameUpdatedAt?: Date;
	wallet?: string; // DEPRECATED: prefer linked_accounts
	smart_wallet?: string; // DEPRECATED: prefer linked_accounts
	linked_accounts?: unknown[];
	referredBy?: string;
	referralClaimedAt?: Date;
	claimedTestUsdcExpReward?: boolean;
	orderCount?: number;
	filledOrderCount?: number;
	fundEmailSent?: Date | null;
	fundEmailSentCount?: number;
	cs?: unknown;
	[key: string]: unknown;
}

interface ApiResponse {
	success: boolean;
	data?: UserProfile;
	error?: string;
}

class UserService {
	/**
	 * Fetch user profile
	 * Endpoint: GET /profiles/me
	 * Response: { success: true, data: { exp: number, username: string, ... } }
	 */
	async getUserProfile(
		accessToken: string,
		identityToken?: string
	): Promise<UserProfile> {
		const headers: HeadersInit = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		};

		if (identityToken) {
			headers["privy-id-token"] = identityToken;
		}

		const response = await fetch(`${API_BASE}/profiles/me`, {
			method: "GET",
			headers,
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch profile: ${response.status}`);
		}

		const result: ApiResponse = await response.json();

		if (!result.success || !result.data) {
			throw new Error(result.error || "Failed to fetch profile");
		}

		return result.data;
	}

	/**
	 * Update user profile
	 * Endpoint: PUT /profiles/me
	 * Body: Partial<UserProfile> (e.g., { username: "newName" } or { exp: 100 })
	 * Response: { success: true, data: { ...updated profile } }
	 */
	async updateUserProfile(
		updates: Partial<UserProfile>,
		accessToken: string,
		identityToken?: string
	): Promise<UserProfile> {
		const headers: HeadersInit = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		};

		if (identityToken) {
			headers["privy-id-token"] = identityToken;
		}

		const response = await fetch(`${API_BASE}/profiles/me`, {
			method: "PUT",
			headers,
			body: JSON.stringify(updates),
		});

		if (!response.ok) {
			throw new Error(`Failed to update profile: ${response.status}`);
		}

		const result: ApiResponse = await response.json();

		if (!result.success || !result.data) {
			throw new Error(result.error || "Failed to update profile");
		}

		return result.data;
	}

	/**
	 * Update username
	 * Convenience method for updating username
	 */
	async updateUsername(
		username: string,
		accessToken: string,
		identityToken?: string
	): Promise<UserProfile> {
		return this.updateUserProfile({ username }, accessToken, identityToken);
	}

	/**
	 * Update exp
	 * Convenience method for updating exp
	 */
	async updateExp(
		exp: number,
		accessToken: string,
		identityToken?: string
	): Promise<UserProfile> {
		return this.updateUserProfile({ exp }, accessToken, identityToken);
	}

	/**
	 * Add exp to user (incremental)
	 * Fetches current exp, adds to it, and saves
	 */
	async addExp(
		expToAdd: number,
		accessToken: string,
		identityToken?: string
	): Promise<UserProfile> {
		// First, get current exp
		const currentProfile = await this.getUserProfile(
			accessToken,
			identityToken
		);
		const currentExp = currentProfile.exp || 0;
		const newExp = currentExp + expToAdd;

		// Then save the new total
		return this.updateExp(newExp, accessToken, identityToken);
	}

	/**
	 * Request exp for test USDC claim (server-verified)
	 * Server verifies the claim actually happened before granting exp
	 * Endpoint: POST /profiles/exp/claim-test-usdc
	 * Response: { success: true, data: { exp: number, ... } }
	 */
	async requestExpForTestUsdcClaim(
		accessToken: string,
		identityToken?: string
	): Promise<UserProfile> {
		const headers: HeadersInit = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		};

		if (identityToken) {
			headers["privy-id-token"] = identityToken;
		}

		const response = await fetch(`${API_BASE}/profiles/exp/claim-test-usdc`, {
			method: "POST",
			headers,
		});

		if (!response.ok) {
			throw new Error(`Failed to request exp for claim: ${response.status}`);
		}

		const result: ApiResponse = await response.json();

		if (!result.success || !result.data) {
			throw new Error(result.error || "Failed to request exp for claim");
		}

		return result.data;
	}
}

// Export singleton instance
export const userService = new UserService();
export default userService;

