import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useIdentityToken } from "@privy-io/react-auth";
import { getLevelFromExp, getProgressToNextLevel, CACHED_EXP_KEY } from "../config/rpgConfig";
import { getUserProfile, saveUserExp, addUserExp } from "../services/rpgService";

export interface RPGState {
	exp: number;
	level: number;
	frameAsset: string;
	frameName: string;
	progress: {
		current: number;
		next: number;
		progress: number;
	};
	loading: boolean;
	error: string | null;
}

// Initialize with level 1 config
const level1Config = getLevelFromExp(0);
const INITIAL_STATE: RPGState = {
	exp: 0,
	level: level1Config.level,
	frameAsset: level1Config.frameAsset,
	frameName: level1Config.frameName,
	progress: getProgressToNextLevel(0),
	loading: true,
	error: null,
};

export function useRPG() {
	const { authenticated, getAccessToken, ready } = usePrivy();
	const { identityToken } = useIdentityToken();
	const [state, setState] = useState<RPGState>(INITIAL_STATE);

	// Load cached exp from localStorage
	const getCachedExp = useCallback((): number => {
		try {
			const cached = localStorage.getItem(CACHED_EXP_KEY);
			return cached ? parseInt(cached, 10) : 0;
		} catch {
			return 0;
		}
	}, []);

	// Save exp to cache
	const saveCachedExp = useCallback((exp: number) => {
		try {
			localStorage.setItem(CACHED_EXP_KEY, exp.toString());
		} catch (error) {
			console.error("Failed to cache exp:", error);
		}
	}, []);

	// Clear cached exp
	const clearCachedExp = useCallback(() => {
		try {
			localStorage.removeItem(CACHED_EXP_KEY);
		} catch (error) {
			console.error("Failed to clear cached exp:", error);
		}
	}, []);

	// Update state from exp
	const updateStateFromExp = useCallback((exp: number) => {
		const levelConfig = getLevelFromExp(exp);
		const progressData = getProgressToNextLevel(exp);

		console.log("🔄 updateStateFromExp called with exp:", exp);
		console.log("🔄 New level:", levelConfig.level);
		console.log("🔄 New progress:", progressData);

		// Create a completely new state object to ensure React detects the change
		const newProgress = {
			current: progressData.current,
			next: progressData.next,
			progress: progressData.progress,
		};

		const newState = {
			exp,
			level: levelConfig.level,
			frameAsset: levelConfig.frameAsset,
			frameName: levelConfig.frameName,
			progress: newProgress,
			loading: false,
			error: null,
		};

		console.log("🔄 setState called with new state:", newState);
		setState(newState);
	}, []);

	// Load exp from server or cache
	const loadExp = useCallback(async () => {
		console.log("🔄 loadExp called");
		setState((prev) => ({ ...prev, loading: true, error: null }));

		try {
			// Wait for identity token before making authenticated requests
			if (authenticated && ready && identityToken) {
				// User is authenticated with identity token - fetch from server
				const token = await getAccessToken();
				if (!token) {
					throw new Error("No access token available");
				}

				const profile = await getUserProfile(token, identityToken);
				console.log("🔍 User Profile after refresh:", profile);
				console.log("🔍 User Profile exp:", profile.exp);
				const exp = profile.exp || 0;

				// Merge with cached exp if exists
				const cachedExp = getCachedExp();
				const totalExp = exp + cachedExp;

				console.log(
					"🔄 Total exp to set:",
					totalExp,
					"(server exp:",
					exp,
					"+ cached:",
					cachedExp,
					")",
				);

				if (cachedExp > 0) {
					// Save merged exp to server
					await saveUserExp(totalExp, token, identityToken);
					clearCachedExp();
				}

				console.log("🔄 Calling updateStateFromExp with:", totalExp);
				updateStateFromExp(totalExp);
			} else if (!authenticated) {
				// User not authenticated - use cached exp
				const cachedExp = getCachedExp();
				updateStateFromExp(cachedExp);
			}
			// If authenticated but no identity token yet, don't update - wait for token
		} catch (error: any) {
			console.error("Failed to load exp:", error);
			// Fallback to cached exp
			const cachedExp = getCachedExp();
			updateStateFromExp(cachedExp);
			setState((prev) => ({
				...prev,
				error: error?.message || "Failed to load exp",
			}));
		}
	}, [
		authenticated,
		ready,
		getAccessToken,
		identityToken,
		getCachedExp,
		clearCachedExp,
		updateStateFromExp,
	]);

	// Add exp (for when user performs actions)
	const addExp = useCallback(
		async (expToAdd: number) => {
			if (expToAdd <= 0) return;

			try {
				if (authenticated && ready && identityToken) {
					// User is authenticated with identity token - save to server
					const token = await getAccessToken();
					if (!token) {
						throw new Error("No access token available");
					}

					await addUserExp(expToAdd, token, identityToken);
					const newExp = state.exp + expToAdd;
					updateStateFromExp(newExp);
				} else {
					// User not authenticated or no identity token - cache it
					const newExp = state.exp + expToAdd;
					saveCachedExp(newExp);
					updateStateFromExp(newExp);
				}
			} catch (error: any) {
				console.error("Failed to add exp:", error);
				// Still update local state even if server save fails
				const newExp = state.exp + expToAdd;
				if (!authenticated) {
					saveCachedExp(newExp);
				}
				updateStateFromExp(newExp);
			}
		},
		[
			authenticated,
			ready,
			getAccessToken,
			identityToken,
			state.exp,
			updateStateFromExp,
			saveCachedExp,
		],
	);

	// Load exp on mount and when auth state changes (wait for identity token)
	useEffect(() => {
		if (ready && (!authenticated || identityToken)) {
			// Load if: ready AND (not authenticated OR have identity token)
			loadExp();
		}
	}, [ready, authenticated, identityToken, loadExp]);

	// Always return a new object to ensure React detects changes
	return {
		exp: state.exp,
		level: state.level,
		frameAsset: state.frameAsset,
		frameName: state.frameName,
		progress: {
			current: state.progress.current,
			next: state.progress.next,
			progress: state.progress.progress,
		},
		loading: state.loading,
		error: state.error,
		addExp,
		refresh: loadExp,
	};
}
