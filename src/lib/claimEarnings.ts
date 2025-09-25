import { ethers } from "ethers";
import useWallet from "lib/wallets/useWallet";
import { useCallback, useMemo, useState } from "react";

// Base mainnet chain id
const BASE_CHAIN_ID = 8453;

// Contracts on Base
const CONTRACTS = {
  CTF: "0xd51B2c739eE5Fe24Bd7d958C1EaE65572183530f",
  COLLATERAL: "0x333C89b2857FA0EE8d9Bcb7328C8672A45637C65", // TestUSDC on Base in this environment
};

// Hardcoded question id from user request
const HARDCODED_QUESTION_ID = "0x1c4e3e9b65029349ea1125d91af72f8486490628518e798382bb627f315a6a77";
// Hardcoded condition id (provided by user)
const HARDCODED_CONDITION_ID = "0x845273138bad81b14693745a9db0c69849ab4fb3e7b7a01d49bc065282999eb9";

// Minimal ABI for redeem
const CTF_ABI = [
  "function getCondition(bytes32 conditionId) view returns (address oracle, bytes32 questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators, uint256 payoutDenominator)",
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) returns (uint256)",
];

// Helper to compute conditionId from questionId for binary markets: keccak256(oracle, questionId, outcomeSlotCount)
function buildConditionId(oracle: string, questionId: string, outcomeSlotCount: number): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "uint256"], [oracle, questionId, outcomeSlotCount])
  );
}

// For a binary market, indexSet YES = 1, NO = 2
const YES_INDEX_SET = 1;
const NO_INDEX_SET = 2;

export function useClaimEarnings() {
  const { account, sendTransaction } = useWallet();
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const iface = useMemo(() => new ethers.Interface(CTF_ABI), []);

  const claim = useCallback(async () => {
    setIsClaiming(true);
    setError(null);
    setTxHash(null);

    try {
      if (!account) throw new Error("Connect wallet");

      // Encode redeemPositions for YES index set only (market resolved as YES)
      const redeemYes = iface.encodeFunctionData("redeemPositions", [
        CONTRACTS.COLLATERAL,
        ethers.ZeroHash,
        HARDCODED_CONDITION_ID,
        [YES_INDEX_SET],
      ]);

      // Submit claim for YES
      const first = await sendTransaction({
        chainId: BASE_CHAIN_ID,
        to: CONTRACTS.CTF,
        data: redeemYes,
        successMessage: "Claim submitted",
        errorMessage: "Claim failed",
      });
      if (!first.success) throw first.error || new Error("Claim transaction failed");
      setTxHash(first.hash || null);

      return true;
    } catch (e: any) {
      setError(e?.message || String(e));
      return false;
    } finally {
      setIsClaiming(false);
    }
  }, [account, sendTransaction, iface]);

  return { claim, isClaiming, error, txHash };
}

export default useClaimEarnings;


