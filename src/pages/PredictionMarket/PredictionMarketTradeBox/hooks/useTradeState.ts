import { useEffect, useState, useCallback } from "react";

export function useTradeState(initialPosition?: "yes" | "no") {
  const [state, setState] = useState({
    selectedPosition: initialPosition || "yes",
    amount: "",
    price: "",
    orderType: "market" as "market" | "limit",
    side: "buy" as "buy" | "sell",
    isLoading: false,
    orderResult: null as any,
    calculatedContracts: null as number | null,
    remainingUsd: null as number | null,
  });

  useEffect(() => {
    if (initialPosition && initialPosition !== state.selectedPosition) {
      setState((prev) => ({ ...prev, selectedPosition: initialPosition }));
    }
  }, [initialPosition, state.selectedPosition]);

  const handlePositionChange = useCallback((position: "yes" | "no") => {
    setState((prev) => ({ ...prev, selectedPosition: position }));
  }, []);
  const handleAmountChange = useCallback((amount: string) => {
    setState((prev) => ({ ...prev, amount }));
  }, []);
  const handlePriceChange = useCallback((price: string) => {
    setState((prev) => ({ ...prev, price }));
  }, []);
  const handleOrderTypeChange = useCallback((orderType: "market" | "limit") => {
    setState((prev) => ({ ...prev, orderType }));
  }, []);
  const handleSideChange = useCallback((side: "buy" | "sell") => {
    setState((prev) => ({ ...prev, side }));
  }, []);

  return { state, setState, handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange } as const;
}


