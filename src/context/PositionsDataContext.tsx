import { createContext, useContext, type ReactNode } from "react";
import usePositionsData from "@/pages/Positions/hooks/usePositionsData";

export type PositionsPageData = ReturnType<typeof usePositionsData>;

const PositionsDataContext = createContext<PositionsPageData | null>(null);

export function PositionsDataProvider({ children }: { children: ReactNode }) {
	const value = usePositionsData();
	return (
		<PositionsDataContext.Provider value={value}>
			{children}
		</PositionsDataContext.Provider>
	);
}

export function usePositionsPageData(): PositionsPageData {
	const ctx = useContext(PositionsDataContext);
	if (!ctx) {
		throw new Error(
			"usePositionsPageData must be used within a PositionsDataProvider",
		);
	}
	return ctx;
}
