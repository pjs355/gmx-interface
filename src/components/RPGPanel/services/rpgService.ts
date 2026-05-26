// Re-export UserProfile type from userService for backward compatibility
export type { UserProfile } from "@/services/api/userService";
import { userService } from "@/services/api/userService";

/**
 * Fetch user profile including exp
 * @deprecated Use userService.getUserProfile instead
 */
export async function getUserProfile(accessToken: string, identityToken?: string) {
	return userService.getUserProfile(accessToken, identityToken);
}

/**
 * Save user exp to profile
 * @deprecated Use userService.updateExp instead
 */
export async function saveUserExp(exp: number, accessToken: string, identityToken?: string) {
	return userService.updateExp(exp, accessToken, identityToken);
}

/**
 * Add exp to user (incremental)
 * @deprecated Use userService.addExp instead
 */
export async function addUserExp(expToAdd: number, accessToken: string, identityToken?: string) {
	return userService.addExp(expToAdd, accessToken, identityToken);
}
