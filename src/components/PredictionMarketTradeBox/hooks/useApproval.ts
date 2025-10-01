import { useCallback, useState } from "react";
import { useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { DEFAULT_RPC_URL } from "config/rpc";

let READ_PROVIDER: ethers.JsonRpcProvider | null = null;
function getReadProvider(): ethers.JsonRpcProvider {
  if (!READ_PROVIDER) READ_PROVIDER = new ethers.JsonRpcProvider(DEFAULT_RPC_URL);
  return READ_PROVIDER;
}

type ApprovalState = {
  isApproved: boolean;
  isChecking: boolean;
  isApproving: boolean;
};

export function useApproval({
  account,
  usdcAddress,
  ctfAddress,
  exchangeAddress,
  getClientForChain,
  hasSmartWallet,
  getActiveSigner,
}: {
  account?: string | null;
  usdcAddress: string;
  ctfAddress: string;
  exchangeAddress: string;
  getClientForChain: (args: { id: number }) => Promise<any>;
  hasSmartWallet?: boolean;
  getActiveSigner?: () => Promise<any>;
}) {
  const { wallets: privyWallets } = usePrivyWallets();
  const [approvalState, setApprovalState] = useState<ApprovalState>({ isApproved: false, isChecking: false, isApproving: false });

  const checkApproval = useCallback(async () => {
    if (!account) return;
    setApprovalState((prev) => ({ ...prev, isChecking: true }));
    try {
      const provider = getReadProvider();

      const usdcContract = new ethers.Contract(
        usdcAddress,
        ["function allowance(address owner, address spender) view returns (uint256)"],
        provider
      );
      const ctfRead = new ethers.Contract(
        ctfAddress,
        ["function isApprovedForAll(address owner, address operator) view returns (bool)"],
        provider
      );

      const usdcAllowance: bigint = await usdcContract.allowance(account, exchangeAddress);
      const hasUsdcApproval = usdcAllowance > 0n;
      const hasCtfApproval: boolean = await ctfRead.isApprovedForAll(account, exchangeAddress);

      setApprovalState((prev) => ({ ...prev, isApproved: hasUsdcApproval && hasCtfApproval, isChecking: false }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error checking approval:", error);
      setApprovalState((prev) => ({ ...prev, isChecking: false }));
    }
  }, [account, privyWallets, usdcAddress, ctfAddress, exchangeAddress]);

  const approveToken = useCallback(async () => {
    if (!account) return;
    setApprovalState((prev) => ({ ...prev, isApproving: true }));
    try {
      await checkApproval();
      if (approvalState.isApproved) {
        setApprovalState((prev) => ({ ...prev, isApproving: false }));
        return;
      }

      const usdcAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
      const usdcInterface = new ethers.Interface(usdcAbi);
      const approvalData = usdcInterface.encodeFunctionData("approve", [exchangeAddress, ethers.MaxUint256]);

      if (hasSmartWallet) {
        const smartWalletClient = await getClientForChain({ id: 8453 });
        if (!smartWalletClient) throw new Error("No smart wallet client available for Base chain");
        await smartWalletClient.sendTransaction({ to: usdcAddress as `0x${string}`, data: approvalData as `0x${string}`, value: 0n });
      } else if (getActiveSigner) {
        const signer = await getActiveSigner();
        if (!signer) throw new Error("No signer available for external wallet");
        // ethers v6 signer has provider
        const tx = await (new ethers.Contract(usdcAddress, usdcAbi, signer)).approve(exchangeAddress, ethers.MaxUint256);
        await tx.wait?.();
      } else {
        throw new Error("No signing method available");
      }

      await new Promise((r) => setTimeout(r, 1500));

      // Approve CTF (ERC1155) operator
      const ctfAbi = [
        "function setApprovalForAll(address operator, bool approved)"
      ];
      if (hasSmartWallet) {
        const smartWalletClient = await getClientForChain({ id: 8453 });
        if (!smartWalletClient) throw new Error("No smart wallet client available for Base chain");
        const ctfInterface = new ethers.Interface(ctfAbi);
        const ctfData = ctfInterface.encodeFunctionData("setApprovalForAll", [exchangeAddress, true]);
        await smartWalletClient.sendTransaction({ to: ctfAddress as `0x${string}`, data: ctfData as `0x${string}`, value: 0n });
      } else if (getActiveSigner) {
        const signer = await getActiveSigner();
        if (!signer) throw new Error("No signer available for external wallet");
        const tx2 = await (new ethers.Contract(ctfAddress, ctfAbi, signer)).setApprovalForAll(exchangeAddress, true);
        await tx2.wait?.();
      } else {
        throw new Error("No signing method available for CTF approval");
      }

      await checkApproval();
      setApprovalState((prev) => ({ ...prev, isApproving: false, isApproved: true }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error approving tokens:", error);
      setApprovalState((prev) => ({ ...prev, isApproving: false }));
    }
  }, [account, checkApproval, ctfAddress, exchangeAddress, getClientForChain, usdcAddress, approvalState.isApproved, hasSmartWallet, getActiveSigner]);

  return { approvalState, checkApproval, approveToken } as const;
}


