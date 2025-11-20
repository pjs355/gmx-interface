import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useIdentityToken } from "@privy-io/react-auth";
import {
	getLevelFromExp,
	getProgressToNextLevel,
	CACHED_EXP_KEY,
} from "@/components/RPGPanel/config/rpgConfig";
import {
	getUserProfile,
	saveUserExp,
	addUserExp,
	requestExpForTestUsdcClaim,
	type UserProfile,
} from "@/components/RPGPanel/services/rpgService";

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

type RPGContextValue = {
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
	addExp: (amount: number) => Promise<void>;
	requestExpForClaim: () => Promise<void>;
	refresh: () => Promise<void>;
};

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

const RPGContext = createContext<RPGContextValue | null>(null);

export function RPGProvider({ children }: { children: React.ReactNode }) {
	const { authenticated, getAccessToken, ready } = usePrivy();
	const { identityToken } = useIdentityToken();
	const [state, setState] = useState<RPGState>(INITIAL_STATE);

	// Load cached exp from localStorage
	const getCachedExp = useCallback((): number => {
		try {
			const cached = localStorage.getItem(CACHED_EXP_KEY);
			if (cached) {
				return parseInt(cached, 10) || 0;
			}
		} catch (error) {
			console.error("Failed to get cached exp:", error);
		}
		return 0;
	}, []);

	// Save cached exp to localStorage
	const setCachedExp = useCallback((exp: number): void => {
		try {
			localStorage.setItem(CACHED_EXP_KEY, exp.toString());
		} catch (error) {
			console.error("Failed to set cached exp:", error);
		}
	}, []);

	// Clear cached exp from localStorage
	const clearCachedExp = useCallback((): void => {
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

		const newProgress = {
			current: progressData.current,
			next: progressData.next,
			progress: progressData.progress,
		};

		const newState: RPGState = {
			exp,
			level: levelConfig.level,
			frameAsset: levelConfig.frameAsset,
			frameName: levelConfig.frameName,
			progress: newProgress,
			loading: false,
			error: null,
		};

		setState(newState);
	}, []);

	// Load exp from server or cache
	const loadExp = useCallback(async () => {
		setState((prev) => ({ ...prev, loading: true, error: null }));

		try {
			if (authenticated && ready) {
				const token = await getAccessToken();
				if (!token) {
					throw new Error("No access token available");
				}

				const profile = await getUserProfile(token, identityToken || undefined);
				const exp = profile.exp || 0;

				const cachedExp = getCachedExp();
				const totalExp = exp + cachedExp;

				if (cachedExp > 0) {
					await saveUserExp(totalExp, token, identityToken || undefined);
					clearCachedExp();
				}

				updateStateFromExp(totalExp);
			} else {
				const cachedExp = getCachedExp();
				updateStateFromExp(cachedExp);
			}
		} catch (error: any) {
			console.error("error", error);
			const cachedExp = getCachedExp();
			updateStateFromExp(cachedExp);
			setState((prev) => ({
				...prev,
				error: error?.message || "Failed to load exp",
			}));
		}
	}, [authenticated, ready, getAccessToken, identityToken, getCachedExp, clearCachedExp, updateStateFromExp]);

	// Add exp (incremental)
	const addExp = useCallback(
		async (amount: number) => {
			if (!authenticated || !ready) {
				// Cache for later
				const currentCached = getCachedExp();
				setCachedExp(currentCached + amount);
				updateStateFromExp(currentCached + amount);
				return;
			}

			try {
				const token = await getAccessToken();
				if (!token) {
					throw new Error("No access token available");
				}

				await addUserExp(amount, token, identityToken || undefined);
				await loadExp();
			} catch (error: any) {
				console.error("error", error);
				// Fallback to cache
				const currentCached = getCachedExp();
				setCachedExp(currentCached + amount);
				updateStateFromExp(currentCached + amount);
			}
		},
		[authenticated, ready, getAccessToken, identityToken, getCachedExp, setCachedExp, updateStateFromExp, loadExp]
	);

	// Request exp for test USDC claim (server-verified)
	const requestExpForClaim = useCallback(async () => {
		if (!authenticated || !ready) {
			return;
		}

		try {
			const token = await getAccessToken();
			if (!token) {
				throw new Error("No access token available");
			}

			const profile = await requestExpForTestUsdcClaim(token, identityToken || undefined);
			const exp = profile.exp || 0;
			updateStateFromExp(exp);
		} catch (error: any) {
			console.error("error", error);
		}
	}, [authenticated, ready, getAccessToken, identityToken, updateStateFromExp]);

	// Load exp when auth state changes
	useEffect(() => {
		if (ready) {
			loadExp();
		}
	}, [ready, authenticated, loadExp]);

	const value: RPGContextValue = {
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
		requestExpForClaim,
		refresh: loadExp,
	};

	return <RPGContext.Provider value={value}>{children}</RPGContext.Provider>;
}

export function useRPG(): RPGContextValue {
	const context = useContext(RPGContext);
	if (!context) {
		throw new Error("useRPG must be used within an RPGProvider");
	}
	return context;
}

