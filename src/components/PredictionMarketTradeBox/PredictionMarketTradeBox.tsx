import { useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import { useSignerContext } from "context/SignerContext";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
// import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
// import { ethers } from "ethers";
import type { TradeBoxProps, TradeExecutionParams } from "./types";
import { useMarketOrderHandler } from "./MarketOrderHandler";
// import { useLimitOrderHandler } from "./LimitOrderHandler";
import { useTradeExecutionService } from "./TradeExecutionService";
import PredictionMarketTradeBoxResponsiveContainer from "./PredictionMarketTradeBoxResponsiveContainer";
// Removed OrderbookContext import - using passed orderbook prop instead
import { useUSDCBalance, checkSufficientBalance, useYesNoBalances, checkSufficientShares } from "./checkBalances";
import { useUserData } from "context/UserDataContext";
import { useBalances } from "context/BalanceContext";
import { useButtonState } from "./hooks/useButtonState";
import { useTradeState } from "./hooks/useTradeState";

interface PredictionMarketTradeBoxProps extends TradeBoxProps {}

// Exposed methods for testing
export interface PredictionMarketTradeBoxHandle {
  setPosition: (position: 'yes' | 'no') => void;
  setAmount: (amount: string) => void;
  setPrice: (price: string) => void;
  setOrderType: (orderType: 'market' | 'limit') => void;
  setSide: (side: 'buy' | 'sell') => void;
  executeTrade: () => Promise<void>;
  getState: () => any;
}

const PredictionMarketTradeBox = forwardRef<PredictionMarketTradeBoxHandle, PredictionMarketTradeBoxProps>(
  ({ market, orderbook: propOrderbook, initialPosition, onPositionChange, onSideChange: onSideChangeCallback }, ref) => {

  const { state, setState, handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange } = useTradeState(initialPosition);
  // const { client: smartClient, getClientForChain } = useSmartWallets();
  const { account } = useSignerContext();
  const { login, authenticated } = usePrivy();

  // Use global approval state from UserDataContext
  const { approvalState, /* checkApproval, */ approveToken, refresh } = useUserData();
  const { refreshBalances } = useBalances();

  const { wallets: privyWallets } = usePrivyWallets();

  // Use passed orderbook directly (no longer using OrderbookContext)
  const orderbook = propOrderbook ?? null;

  // Custom hooks for different order types
  const marketOrderHandler = useMarketOrderHandler(orderbook);
  // const limitOrderHandler = useLimitOrderHandler(orderbook);
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

  // Notify parent when side changes (buy/sell)
  const onSideChangeWrapper = useCallback((side: "buy" | "sell") => {
    handleSideChange(side);
    onSideChangeCallback?.(side);
  }, [handleSideChange, onSideChangeCallback]);

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
        const contractsInt = Math.floor(result.contracts);
        return {
          calculatedContracts: contractsInt,
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
        // Helper: derive top-of-book prices (do not mutate orderbook)
        const bestAsk = orderbook?.asks && orderbook.asks.length > 0
          ? Math.min(...orderbook.asks.map((a: any) => a.price))
          : null;
        const bestBid = orderbook?.bids && orderbook.bids.length > 0
          ? Math.max(...orderbook.bids.map((b: any) => b.price))
          : null;

        if (frozenState.side === "buy") {
          const usdAmount = parseFloat(frozenState.amount);
          const calc = marketOrderHandler.calculateContractsForMarketOrder(
            usdAmount,
            frozenState.selectedPosition,
            "buy"
          );
          // Ensure whole-share execution
          orderAmount = Math.floor(calc.contracts);

          if (!orderAmount || !isFinite(orderAmount) || orderAmount <= 0) {
            throw new Error("Unable to compute contracts for market buy order");
          }

          // For BUY market orders:
          // - calc.contracts = shares bought
          // - calc.remainingUsd = leftover USD that wasn't spent
          // - calc.maxPrice = HIGHEST price hit (worst case for signing)
          const sharesBought = orderAmount;
          const usdSpent = usdAmount - calc.remainingUsd;
          const effectiveAvgPrice = usdSpent / sharesBought;
          const maxPrice = (calc as any).maxPrice;
          
          // Use MAXIMUM price for signing (conservative/worst case)
          // Sign at highest price to guarantee we pay at most this much
          if (!maxPrice || !isFinite(maxPrice) || maxPrice <= 0) {
            throw new Error("Unable to determine maximum price for market buy order");
          }
          
          // Round to 2 decimal places to avoid floating point precision errors
          orderPrice = Math.round(maxPrice * 100) / 100;
          
          console.log("📊 Market BUY calculation:", {
            usdAmount: usdAmount,
            sharesBought: sharesBought,
            usdSpent: usdSpent,
            remainingUsd: calc.remainingUsd,
            maxPrice: maxPrice,
            effectiveAvgPrice: effectiveAvgPrice,
            signingPrice: orderPrice
          });
        } else {
          // SELL market uses shares input directly
          orderAmount = parseFloat(frozenState.amount);
          if (!orderAmount || !isFinite(orderAmount) || orderAmount <= 0) {
            throw new Error("Invalid shares for market sell order");
          }

          // Calculate minimum price from all price levels for signing
          const sellCalc = marketOrderHandler.calculateContractsForMarketOrder(
            orderAmount,
            frozenState.selectedPosition,
            "sell"
          );
          
          // For SELL market orders:
          // - sellCalc.contracts = shares actually sold (may be less than requested!)
          // - sellCalc.remainingUsd = total USD received (NOT remaining!)
          // - sellCalc.minPrice = LOWEST price hit (conservative for signing)
          const sharesSold = sellCalc.contracts;
          const totalUsdReceived = sellCalc.remainingUsd;
          const minPrice = (sellCalc as any).minPrice;
          
          if (!sharesSold || sharesSold <= 0) {
            throw new Error("Unable to sell shares - insufficient orderbook liquidity");
          }
          
          // CRITICAL: Use actual shares sold, not requested amount
          // This handles cases where orderbook can't fill the full amount
          orderAmount = sharesSold;
          
          // Use MINIMUM price for signing (conservative/worst case)
          // Sign at lowest price to guarantee at least this much back
          // This allows fills at minPrice OR BETTER (higher prices)
          if (!minPrice || !isFinite(minPrice) || minPrice <= 0) {
            throw new Error("Unable to determine minimum price for market sell order");
          }
          
          // Round to 2 decimal places to avoid floating point precision errors
          orderPrice = Math.round(minPrice * 100) / 100;
          
          const effectiveAvgPrice = totalUsdReceived / sharesSold;
          
          console.log("📊 Market SELL calculation:", {
            sharesRequested: parseFloat(frozenState.amount),
            sharesSold: sharesSold,
            totalUsdReceived: totalUsdReceived,
            minPrice: minPrice,
            maxPrice: (sellCalc as any).maxPrice,
            effectiveAvgPrice: effectiveAvgPrice,
            signingPrice: orderPrice,
            finalOrderAmount: orderAmount,
            signatureAmount: orderAmount,
            signaturePrice: orderPrice,
            signatureTotalUSD: orderAmount * orderPrice,
            actualTotalUSD: totalUsdReceived
          });
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
        
        // Refresh balances after successful trade with a delay
        // Wait 4 seconds to give blockchain time to process the transaction
        setTimeout(async () => {
          try {
            console.log("🔄 Starting balance refresh after 4 second delay...");
            
            // First refresh the main user data (includes all token balances)
            await refresh();
            console.log("✅ User data refreshed");
            
            // Get the market's token IDs for this specific market
            const yesTokenId = (market as any)?.yesTokenId;
            const noTokenId = (market as any)?.noTokenId;
            
            // Then refresh the specific market token balances in BalanceContext
            if (yesTokenId && noTokenId) {
              await refreshBalances([yesTokenId, noTokenId]);
              console.log("✅ Market token balances refreshed");
            }
            
            console.log("✅ All balances refreshed after successful trade");
          } catch (error) {
            console.error("❌ Error refreshing balances after trade:", error);
            // Don't fail the trade if balance refresh fails
          }
        }, 4000); // 4 second delay
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

  // Expose methods for testing via ref
  useImperativeHandle(ref, () => ({
    setPosition: (position: 'yes' | 'no') => {
      handlePositionChange(position);
    },
    setAmount: (amount: string) => {
      handleAmountChange(amount);
    },
    setPrice: (price: string) => {
      handlePriceChange(price);
    },
    setOrderType: (orderType: 'market' | 'limit') => {
      handleOrderTypeChange(orderType);
    },
    setSide: (side: 'buy' | 'sell') => {
      handleSideChange(side);
    },
    executeTrade: async () => {
      // Validation checks - same as button would do
      if (!authenticated) {
        throw new Error("Not authenticated - please log in with Privy");
      }
      if (!account) {
        throw new Error("No wallet connected - account not available");
      }
      if (state.isLoading) {
        throw new Error("Already processing a trade");
      }
      if (!approvalState.isApproved) {
        throw new Error("Tokens not approved - please approve first");
      }
      if (!state.selectedPosition || !state.amount || (state.orderType === "limit" && !state.price)) {
        throw new Error("Missing required fields: position, amount, or price");
      }
      
      // CRITICAL: Check for sufficient shares on SELL orders
      if (state.side === 'sell') {
        console.log("🔍 SELL order validation:", {
          side: state.side,
          position: state.selectedPosition,
          amount: state.amount,
          yesBalance: yesBalance,
          noBalance: noBalance,
          availableForThisPosition: state.selectedPosition === 'yes' ? yesBalance : noBalance
        });
        
        const sharesCheck = checkSufficientShares(
          state.amount, 
          state.orderType, 
          state.side, 
          state.selectedPosition, 
          yesBalance, 
          noBalance
        );
        
        console.log("🔍 Shares check result:", sharesCheck);
        
        if (!sharesCheck.hasSufficientShares) {
          throw new Error(`Insufficient ${state.selectedPosition.toUpperCase()} shares. Required: ${sharesCheck.requiredShares}, Available: ${state.selectedPosition === 'yes' ? yesBalance : noBalance}`);
        }
      }
      
      await handleTrade();
    },
    getState: () => state,
  }), [handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange, handleTrade, state, authenticated, account, approvalState, yesBalance, noBalance]);

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
      onSideChange={onSideChangeWrapper}
      onTrade={handleTrade}
      buttonState={buttonState}
      approvalState={approvalState}
    />
  );
});

PredictionMarketTradeBox.displayName = "PredictionMarketTradeBox";

export default PredictionMarketTradeBox;


