import React, { useCallback, useMemo, useEffect } from "react";
import useWallet from "lib/wallets/useWallet";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { ethers } from "ethers";
import type { TradeBoxProps, TradeExecutionParams } from "./types";
import { useMarketOrderHandler } from "./MarketOrderHandler";
import { useLimitOrderHandler } from "./LimitOrderHandler";
import { useTradeExecutionService } from "./TradeExecutionService";
import PredictionMarketTradeBoxResponsiveContainer from "./PredictionMarketTradeBoxResponsiveContainer";
// Removed OrderbookContext import - using passed orderbook prop instead
import { useUSDCBalance, checkSufficientBalance, useYesNoBalances, checkSufficientShares } from "./checkBalances";
// Removed useApproval import - using global context instead
import { useUserData } from "context/UserDataContext";
import { useBalances } from "context/BalanceContext";
import { useButtonState } from "./hooks/useButtonState";
import { useTradeState } from "./hooks/useTradeState";

interface PredictionMarketTradeBoxProps extends TradeBoxProps {}

export default function PredictionMarketTradeBox({ market, orderbook: propOrderbook, initialPosition, onPositionChange }: PredictionMarketTradeBoxProps) {
  // Constants for token approval
  const NEW_FAKE_USDC_ADDRESS = "0x333C89b2857FA0EE8d9Bcb7328C8672A45637C65";
  const CTF_ADDRESS = "0xd51B2c739eE5Fe24Bd7d958C1EaE65572183530f"; // CTF contract address
  const EXCHANGE_ADDRESS = "0x40fdD2b575b3CF3dF64eA6B43C3C47E1eC2fbf03"; // EXCHANGE contract address

  const { state, setState, handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange } = useTradeState(initialPosition);
  const { client: smartClient, getClientForChain } = useSmartWallets();
  const walletApi = useWallet() as any;
  const account = walletApi.getDataAddress();
  const { login, authenticated } = usePrivy();

  // Use global approval state from UserDataContext
  const { approvalState, checkApproval, approveToken, refresh } = useUserData();
  const { refreshBalances } = useBalances();

  const { wallets: privyWallets } = usePrivyWallets();
  
  

  // Use passed orderbook directly (no longer using OrderbookContext)
  const orderbook = propOrderbook ?? null;

  // Custom hooks for different order types
  const marketOrderHandler = useMarketOrderHandler(orderbook);
  const limitOrderHandler = useLimitOrderHandler(orderbook);
  const tradeExecutionService = useTradeExecutionService();
  const usdcBalance = useUSDCBalance();
  const { yesBalance, noBalance } = useYesNoBalances(market);

  // Commented out approval checking - always approve instead
  // const checkApproval = useCallback(async () => {
  //   if (!account) return;
  //   console.log("🔍 Checking approval for account:", account);
  //   setApprovalState((prev) => ({ ...prev, isChecking: true }));

  //   try {
  //     // Check actual approval status using smart wallet
  //     console.log("🔍 Checking actual approval status...");

  //     let isApproved = false;

  //     try {
  //       // Create a simple provider that can make read calls
  //       const { ethers } = await import("ethers");

  //       // Use Base RPC for read operations (this is safe for read-only calls)
  //       const provider = new ethers.JsonRpcProvider(
  //         "https://base-mainnet.rpc.privy.systems/?privyAppId=cm0yq8l6c03i1gec9i6yz1w6f"
  //       );

  //       // Check USDC allowance for CTF contract
  //       const usdcContract = new ethers.Contract(
  //         NEW_FAKE_USDC_ADDRESS,
  //         ["function allowance(address owner, address spender) view returns (uint256)"],
  //         provider
  //       );

  //       const usdcAllowance = await usdcContract.allowance(account, CTF_ADDRESS);
  //       const hasUsdcApproval = usdcAllowance > ethers.parseUnits("1000000", 6); // Check if approved for 1M+ USDC

  //       console.log("🔍 USDC allowance for CTF:", ethers.formatUnits(usdcAllowance, 6));

  //       // Check CTF approval for EXCHANGE contract
  //       const ctfContract = new ethers.Contract(
  //         CTF_ADDRESS,
  //         ["function isApprovedForAll(address owner, address operator) view returns (bool)"],
  //         provider
  //       );

  //       const ctfApproval = await ctfContract.isApprovedForAll(account, EXCHANGE_ADDRESS);

  //       console.log("🔍 CTF approval for EXCHANGE:", ctfApproval);

  //       // Both approvals must be present
  //       isApproved = hasUsdcApproval && ctfApproval;

  //       console.log("🔍 Overall approval status:", isApproved);
  //     } catch (error) {
  //       console.error("Error checking approval status:", error);
  //       // If we can't check, assume approval is needed
  //       isApproved = false;
  //     }

  //     setApprovalState((prev) => ({
  //       ...prev,
  //       isApproved,
  //       isChecking: false,
  //     }));
  //   } catch (error) {
  //     console.error("Error checking approval:", error);
  //     setApprovalState((prev) => ({ ...prev, isChecking: false }));
  //   }
  // }, [account]);


  // Event handlers with state change logging
  // Notify parent when position changes
  const onPositionChangeWrapper = useCallback((position: "yes" | "no") => {
    handlePositionChange(position);
    onPositionChange?.(position);
  }, [handlePositionChange, onPositionChange]);

  // Approval is now handled globally in UserDataContext

  // Function to manually refresh approval status (useful for users to check after approval)
  // const refreshApprovalStatus = useCallback(() => {
  //   if (account) {
  //     console.log("🔄 Manually refreshing approval status...");
  //     checkApproval();
  //   }
  // }, [account, checkApproval]);

  // Calculate contracts for market orders immediately when dependencies change
  const calculatedMarketOrderData = useMemo(() => {
    // Only run if we have all required data and it's a market order
    if (state.orderType === "market" && state.amount && state.selectedPosition && orderbook) {
      const usdAmount = parseFloat(state.amount);
      if (!isNaN(usdAmount) && usdAmount > 0) {
        const result = marketOrderHandler.calculateContractsForMarketOrder(
          usdAmount,
          state.selectedPosition,
          state.side
        );
        return {
          calculatedContracts: result.contracts,
          remainingUsd: result.remainingUsd,
        };
      }
    }
    return {
      calculatedContracts: null,
      remainingUsd: null,
    };
  }, [state.amount, state.selectedPosition, state.orderType, state.side, orderbook, marketOrderHandler]);

  // Note: calculatedMarketOrderData is passed directly to UI component, no need for useEffect

  // Handle trade execution
  const handleTrade = useCallback(async () => {
    if (!state.selectedPosition || !state.amount || (state.orderType === "limit" && !state.price)) return;

    // Check if wallet is connected
    if (!account) {
      setState((prev) => ({
        ...prev,
        orderResult: {
          success: false,
          error: "No wallet connected. Please connect your wallet first.",
        },
      }));
      return;
    }

    // CRITICAL: Freeze the current state to prevent race conditions
    const frozenState = {
      selectedPosition: state.selectedPosition,
      amount: state.amount,
      price: state.price,
      orderType: state.orderType,
      side: state.side,
      calculatedContracts: state.calculatedContracts,
      remainingUsd: state.remainingUsd,
    };

    // Log the frozen state for debugging
    console.log("🔒 FROZEN STATE FOR TRADE EXECUTION:", frozenState);
    console.log("🔍 State validation:", {
      hasPosition: Boolean(frozenState.selectedPosition),
      hasAmount: Boolean(frozenState.amount),
      hasPrice: frozenState.orderType === "limit" ? Boolean(frozenState.price) : true,
      position: frozenState.selectedPosition,
      side: frozenState.side,
      orderType: frozenState.orderType,
    });

    // CRITICAL: Validate state before proceeding
    if (!frozenState.selectedPosition || !frozenState.amount) {
      console.error("❌ INVALID STATE: Missing required fields", frozenState);
      setState((prev) => ({
        ...prev,
        orderResult: {
          success: false,
          error: "Invalid state: Missing required fields",
        },
      }));
      return;
    }

    if (frozenState.orderType === "limit" && !frozenState.price) {
      console.error("❌ INVALID STATE: Missing price for limit order", frozenState);
      setState((prev) => ({
        ...prev,
        orderResult: {
          success: false,
          error: "Invalid state: Missing price for limit order",
        },
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, orderResult: null }));

    try {
      // Resolve embedded (smart) wallet from Privy if available
      const privyWallet: any = Array.isArray(privyWallets)
        ? (privyWallets as any[]).find((w) => w?.type === "smart_wallet") || (privyWallets as any[])[0]
        : undefined;

      // Determine order amount and price based on side and type
      // - MARKET BUY: amount input is USD; recompute contracts and effective price
      // - MARKET SELL: amount input is shares; calculate effective price
      // - LIMIT (buy/sell): amount input is shares; use provided price
      let orderAmount: number;
      let orderPrice: number;
      
      if (frozenState.orderType === "market") {
        if (frozenState.side === "buy") {
          const usdAmount = parseFloat(frozenState.amount);
          const calc = marketOrderHandler.calculateContractsForMarketOrder(
            usdAmount,
            frozenState.selectedPosition,
            "buy"
          );
          orderAmount = calc.contracts;

          if (!orderAmount || !isFinite(orderAmount) || orderAmount <= 0) {
            throw new Error("Unable to compute contracts for market buy order");
          }
          
          // Calculate effective price for market buy orders
          orderPrice = marketOrderHandler.getEffectivePrice(usdAmount, orderAmount, calc.remainingUsd);
          if (!orderPrice || !isFinite(orderPrice) || orderPrice <= 0) {
            throw new Error("Unable to calculate effective price for market buy order");
          }
        } else {
          // SELL market uses shares input directly
          orderAmount = parseFloat(frozenState.amount);
          
          // Calculate effective price for market sell orders
          const calc = marketOrderHandler.calculateContractsForMarketOrder(
            orderAmount,
            frozenState.selectedPosition,
            "sell"
          );
          orderPrice = marketOrderHandler.getEffectivePrice(orderAmount, orderAmount, calc.remainingUsd);
          if (!orderPrice || !isFinite(orderPrice) || orderPrice <= 0) {
            throw new Error("Unable to calculate effective price for market sell order");
          }
        }
      } else {
        // LIMIT orders use shares input directly and provided price
        orderAmount = parseFloat(frozenState.amount);
        orderPrice = parseFloat(frozenState.price) / 100; // Convert cents to dollars
        
        if (!orderPrice || !isFinite(orderPrice) || orderPrice <= 0) {
          throw new Error("Invalid price for limit order");
        }
      }

      const tradeParams: TradeExecutionParams = {
        marketId: market._id,
        position: frozenState.selectedPosition,
        amount: orderAmount,
        price: orderPrice,
        orderType: frozenState.orderType,
        side: frozenState.side,
        userAddress: account,
        market,
      };

      // Log the final trade parameters being sent
      console.log("📤 TRADE PARAMETERS BEING SENT:", tradeParams);

      // Use smart wallet pattern from GMX for trade execution
      const result = await tradeExecutionService.executeTrade(tradeParams, privyWallet);

      setState((prev) => ({ ...prev, orderResult: result }));

      if (result.success) {
        // Clear form on success (but keep selected position)
        setState((prev) => ({
          ...prev,
          amount: "",
          price: "",
        }));
        
        // Refresh balances after successful trade
        try {
          // Get the market's token IDs for this specific market
          const marketId = market._id;
          const yesTokenId = (market as any)?.yesTokenId;
          const noTokenId = (market as any)?.noTokenId;
          
          // Refresh USDC balance and market token balances
          if (yesTokenId && noTokenId) {
            await refreshBalances([yesTokenId, noTokenId]);
          }
          
          // Also refresh the main user data (USDC balance, portfolio, etc.)
          await refresh();
          
          console.log("✅ Balances refreshed after successful trade");
        } catch (error) {
          console.error("❌ Error refreshing balances after trade:", error);
          // Don't fail the trade if balance refresh fails
        }
      }
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        orderResult: {
          success: false,
          error: error.message || "Order execution failed",
        },
      }));
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [state, account, market, tradeExecutionService]);

  // Auto-dismiss order result after 4 seconds
  useEffect(() => {
    if (state.orderResult) {
      const timer = setTimeout(() => {
        setState((prev) => ({ ...prev, orderResult: null }));
      }, 4000); // Dismiss after 4 seconds
      return () => clearTimeout(timer);
    }
  }, [state.orderResult]);

  // Button state logic
  const buttonState = useButtonState({
    authenticated,
    account,
    state,
    login,
    approvalState,
    approveToken,
    marketOrderHandler,
    usdcBalance,
    yesBalance,
    noBalance,
    handleTrade,
    checkSufficientBalance,
    checkSufficientShares,
    market,
  });

  return (
    <PredictionMarketTradeBoxResponsiveContainer
      market={market}
      orderbook={orderbook}
      state={{
        ...state,
        calculatedContracts: calculatedMarketOrderData.calculatedContracts,
        remainingUsd: calculatedMarketOrderData.remainingUsd,
      }}
      onPositionChange={onPositionChangeWrapper}
      onAmountChange={handleAmountChange}
      onPriceChange={handlePriceChange}
      onOrderTypeChange={handleOrderTypeChange}
      onSideChange={handleSideChange}
      onTrade={handleTrade}
      buttonState={buttonState}
      approvalState={approvalState}
    />
  );
}
