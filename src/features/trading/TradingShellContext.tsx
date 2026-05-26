import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";

export type TradingShellIntent = "idle" | "fund_polymarket" | "bridge" | "deploy_safe" | "trade";

type TradingShellContextValue = {
	intent: TradingShellIntent;
	setIntent: (i: TradingShellIntent) => void;
	shellError: string | null;
	setShellError: (e: string | null) => void;
	profileId: string | undefined;
	setProfileId: (id: string | undefined) => void;
	refetchTradingData: () => Promise<void>;
};

const TradingShellContext = createContext<TradingShellContextValue | null>(null);

export function TradingShellProvider({ children }: { children: React.ReactNode }) {
	const qc = useQueryClient();
	const [profileId, setProfileId] = useState<string | undefined>(undefined);
	const [intent, setIntent] = useState<TradingShellIntent>("idle");
	const [shellError, setShellError] = useState<string | null>(null);

	const refetchTradingData = useCallback(async () => {
		await qc.invalidateQueries({ queryKey: tradingQueryKeys.profileMe });
		if (profileId) {
			await qc.invalidateQueries({
				queryKey: tradingQueryKeys.accountOverview(profileId),
			});
		}
		await qc.invalidateQueries({
			queryKey: tradingQueryKeys.polymarketAccount,
		});
	}, [qc, profileId]);

	const value = useMemo(
		(): TradingShellContextValue => ({
			intent,
			setIntent,
			shellError,
			setShellError,
			profileId,
			setProfileId,
			refetchTradingData,
		}),
		[intent, shellError, profileId, refetchTradingData],
	);

	return <TradingShellContext.Provider value={value}>{children}</TradingShellContext.Provider>;
}

export function useTradingShell() {
	const ctx = useContext(TradingShellContext);
	if (!ctx) {
		throw new Error("useTradingShell must be used within TradingShellProvider");
	}
	return ctx;
}

export function useTradingShellOptional(): TradingShellContextValue | null {
	return useContext(TradingShellContext);
}
