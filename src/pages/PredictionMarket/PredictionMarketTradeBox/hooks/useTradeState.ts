import { useEffect, useState, useCallback } from "react";
import type { TradingVenue } from "@/config/venueConfig";

export function useTradeState(initialPosition?: "yes" | "no", initialVenue?: TradingVenue) {
  const [state, setState] = useState({
    tradingVenue: (initialVenue || "levelup") as TradingVenue,
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
    setState((prev) => {
      if (prev.side === side) return prev;
      // Market buy is USD, market sell is shares; reset so we never carry the wrong denomination.
      return { ...prev, side, amount: "" };
    });
  }, []);
  const handleTradingVenueChange = useCallback((tradingVenue: TradingVenue) => {
    setState((prev) => ({
      ...prev,
      tradingVenue,
      ...(tradingVenue === "all" ? { orderType: "market" as const } : {}),
    }));
  }, []);

  return { state, setState, handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange, handleTradingVenueChange } as const;
}
