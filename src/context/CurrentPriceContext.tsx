import React, {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
} from "react";
import {
	currentPriceService,
	type MarketPrices,
} from "@/services/api/currentPriceService";

interface CurrentPriceContextType {
	getCurrentPrice: (
		marketId: string,
		position: "yes" | "no"
	) => number | null;
	getMarketPrices: (marketId: string) => MarketPrices | null;
	refreshMarkets: (marketIds: string[]) => Promise<void>;
	isLoading: boolean;
}

const CurrentPriceContext = createContext<CurrentPriceContextType | null>(null);

export function CurrentPriceProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [isLoading, setIsLoading] = useState(false);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	const getCurrentPrice = useCallback(
		(marketId: string, position: "yes" | "no"): number | null => {
			// Use the service's improved logic directly
			const cached = currentPriceService.getCachedPrices(marketId);
			if (!cached) {
				// Trigger async refresh but return null for now
				currentPriceService
					.getCurrentPrice(marketId, position)
					.catch(console.error);
				return null;
			}

			// Check if cache is stale
			if (Date.now() - cached[position].timestamp > 30000) {
				// 30 seconds
				// If we have stale data, return it while refreshing in background
				if (cached[position].value !== null) {
					currentPriceService
						.getCurrentPrice(marketId, position)
						.catch(console.error);
					return cached[position].value;
				}
				// No stale data, trigger refresh and return null
				currentPriceService
					.getCurrentPrice(marketId, position)
					.catch(console.error);
				return null;
			}

			return cached[position].value;
		},
		[]
	);

	const getMarketPrices = useCallback(
		(marketId: string): MarketPrices | null => {
			// Use the service's improved logic directly
			const cached = currentPriceService.getCachedPrices(marketId);
			if (!cached) {
				// Trigger async refresh but return null for now
				currentPriceService
					.getMarketPrices(marketId)
					.catch(console.error);
				return null;
			}

			// Check if cache is stale
			if (
				Date.now() - cached.yes.timestamp > 30000 ||
				Date.now() - cached.no.timestamp > 30000
			) {
				// If we have stale data, return it while refreshing in background
				if (cached.yes.value !== null || cached.no.value !== null) {
					currentPriceService
						.getMarketPrices(marketId)
						.catch(console.error);
					return cached;
				}
				// No stale data, trigger refresh and return null
				currentPriceService
					.getMarketPrices(marketId)
					.catch(console.error);
				return null;
			}

			return cached;
		},
		[]
	);

	const refreshMarkets = useCallback(async (marketIds: string[]) => {
		if (marketIds.length === 0) return;

		setIsLoading(true);
		try {
			await currentPriceService.refreshMarkets(marketIds);
			setRefreshTrigger((prev) => prev + 1); // Trigger re-renders
		} catch (error) {
			console.error("Error refreshing markets:", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	return (
		<CurrentPriceContext.Provider
			value={{
				getCurrentPrice,
				getMarketPrices,
				refreshMarkets,
				isLoading,
			}}
		>
			{children}
		</CurrentPriceContext.Provider>
	);
}

export function useCurrentPrices() {
	const context = useContext(CurrentPriceContext);
	if (!context) {
		throw new Error(
			"useCurrentPrices must be used within a CurrentPriceProvider"
		);
	}
	return context;
}

export default CurrentPriceContext;
