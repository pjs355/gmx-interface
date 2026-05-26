import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useIdentityToken } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import {
	getLevelFromExp,
	getProgressToNextLevel,
	CACHED_EXP_KEY,
} from "@/components/RPGPanel/config/rpgConfig";
import {
	saveUserExp,
	addUserExp,
	type UserProfile,
} from "@/components/RPGPanel/services/rpgService";
import { useCurrentProfile } from "@/features/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/features/trading/queryKeys";

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
	profile: UserProfile | null;
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
	profile: UserProfile | null;
	addExp: (amount: number) => Promise<void>;
	refresh: () => Promise<void>;
};

const level1Config = getLevelFromExp(0);
const INITIAL_STATE: RPGState = {
	exp: 0,
	level: level1Config.level,
	frameAsset: level1Config.frameAsset,
	frameName: level1Config.frameName,
	progress: getProgressToNextLevel(0),
	loading: true,
	error: null,
	profile: null,
};

const RPGContext = createContext<RPGContextValue | null>(null);

export function RPGProvider({ children }: { children: React.ReactNode }) {
	const { authenticated, getAccessToken, ready } = usePrivy();
	const { identityToken } = useIdentityToken();
	const queryClient = useQueryClient();
	const [state, setState] = useState<RPGState>(INITIAL_STATE);
	const cachedExpSyncedRef = useRef(false);

	// Shared profile from React Query (same cache as header, PortfolioContext, etc.)
	const profileQuery = useCurrentProfile();

	const getCachedExp = useCallback((): number => {
		try {
			const cached = localStorage.getItem(CACHED_EXP_KEY);
			if (cached) return parseInt(cached, 10) || 0;
		} catch {}
		return 0;
	}, []);

	const setCachedExp = useCallback((exp: number): void => {
		try {
			localStorage.setItem(CACHED_EXP_KEY, exp.toString());
		} catch {}
	}, []);

	const clearCachedExp = useCallback((): void => {
		try {
			localStorage.removeItem(CACHED_EXP_KEY);
		} catch {}
	}, []);

	const updateStateFromExp = useCallback((exp: number, profile?: UserProfile | null) => {
		const levelConfig = getLevelFromExp(exp);
		const progressData = getProgressToNextLevel(exp);

		setState((prev) => ({
			exp,
			level: levelConfig.level,
			frameAsset: levelConfig.frameAsset,
			frameName: levelConfig.frameName,
			progress: {
				current: progressData.current,
				next: progressData.next,
				progress: progressData.progress,
			},
			loading: false,
			error: null,
			profile: profile !== undefined ? profile : prev.profile,
		}));
	}, []);

	// Derive RPG state from the shared profile query instead of a separate fetch.
	// Also handle syncing cached (offline) exp on first load.
	useEffect(() => {
		if (profileQuery.isLoading) return;

		if (profileQuery.data) {
			const profile = profileQuery.data as UserProfile;
			const serverExp = profile.exp || 0;
			const cachedExp = getCachedExp();

			if (cachedExp > 0 && !cachedExpSyncedRef.current) {
				const totalExp = serverExp + cachedExp;
				// Optimistically show the merged total immediately
				updateStateFromExp(totalExp, profile);
				(async () => {
					try {
						const token = await getAccessToken();
						if (token && identityToken) {
							await saveUserExp(totalExp, token, identityToken);
							clearCachedExp();
							// Mark synced only after server confirms
							cachedExpSyncedRef.current = true;
							queryClient.invalidateQueries({ queryKey: tradingQueryKeys.profileMe });
						}
					} catch {
						// Leave cachedExpSyncedRef false so next profile update retries
					}
				})();
			} else {
				updateStateFromExp(serverExp, profile);
			}
		} else if (profileQuery.isError) {
			// Profile query failed -- fall back to cached exp
			const cachedExp = getCachedExp();
			updateStateFromExp(cachedExp, null);
			setState((prev) => ({ ...prev, error: "Failed to load profile" }));
		} else if (!authenticated) {
			const cachedExp = getCachedExp();
			updateStateFromExp(cachedExp, null);
		}
	}, [
		profileQuery.isLoading,
		profileQuery.isError,
		profileQuery.data,
		authenticated,
		getCachedExp,
		clearCachedExp,
		getAccessToken,
		identityToken,
		updateStateFromExp,
		queryClient,
	]);

	// Reset sync flag on logout
	useEffect(() => {
		if (!authenticated) cachedExpSyncedRef.current = false;
	}, [authenticated]);

	const addExpFn = useCallback(
		async (amount: number) => {
			if (!authenticated || !ready || !identityToken) {
				const currentCached = getCachedExp();
				setCachedExp(currentCached + amount);
				updateStateFromExp(currentCached + amount, null);
				return;
			}

			try {
				const token = await getAccessToken();
				if (!token) throw new Error("No access token available");

				await addUserExp(amount, token, identityToken);
				queryClient.invalidateQueries({ queryKey: tradingQueryKeys.profileMe });
			} catch (error: any) {
				console.error("error", error);
				const currentCached = getCachedExp();
				setCachedExp(currentCached + amount);
				updateStateFromExp(currentCached + amount, null);
			}
		},
		[
			authenticated,
			ready,
			getAccessToken,
			identityToken,
			getCachedExp,
			setCachedExp,
			updateStateFromExp,
			queryClient,
		],
	);

	const refresh = useCallback(async () => {
		queryClient.invalidateQueries({ queryKey: tradingQueryKeys.profileMe });
	}, [queryClient]);

	const value = useMemo<RPGContextValue>(
		() => ({
			exp: state.exp,
			level: state.level,
			frameAsset: state.frameAsset,
			frameName: state.frameName,
			progress: state.progress,
			loading: state.loading,
			error: state.error,
			profile: state.profile,
			addExp: addExpFn,
			refresh,
		}),
		[state, addExpFn, refresh],
	);

	return <RPGContext.Provider value={value}>{children}</RPGContext.Provider>;
}

export function useRPG(): RPGContextValue {
	const context = useContext(RPGContext);
	if (!context) {
		throw new Error("useRPG must be used within an RPGProvider");
	}
	return context;
}
