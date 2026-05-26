import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type PositionsPageMetricsGateValue = {
	/** When true, app header shows skeleton for portfolio + cash until positions page finishes loading. */
	blockHeaderMetrics: boolean;
	setBlockHeaderMetrics: (v: boolean) => void;
};

const PositionsPageMetricsGateContext = createContext<PositionsPageMetricsGateValue | null>(null);

export function PositionsPageMetricsGateProvider({ children }: { children: ReactNode }) {
	const [blockHeaderMetrics, setBlockHeaderMetricsState] = useState(false);
	const setBlockHeaderMetrics = useCallback((v: boolean) => {
		setBlockHeaderMetricsState(v);
	}, []);

	const value = useMemo(
		() => ({ blockHeaderMetrics, setBlockHeaderMetrics }),
		[blockHeaderMetrics, setBlockHeaderMetrics],
	);

	return (
		<PositionsPageMetricsGateContext.Provider value={value}>
			{children}
		</PositionsPageMetricsGateContext.Provider>
	);
}

export function usePositionsPageMetricsGate(): PositionsPageMetricsGateValue {
	const ctx = useContext(PositionsPageMetricsGateContext);
	if (!ctx) {
		return {
			blockHeaderMetrics: false,
			setBlockHeaderMetrics: () => {},
		};
	}
	return ctx;
}
