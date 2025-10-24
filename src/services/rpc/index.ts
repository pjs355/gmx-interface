import { Network } from "ethers";
import { Signer, ethers } from "ethers";

import {
  BASE,
  getFallbackRpcUrl,
} from "config/chains";
// Removed WebSocketProvider - not needed for Privy/prediction markets

export function getProvider(signer: undefined, chainId: number): ethers.JsonRpcProvider;
export function getProvider(signer: Signer, chainId: number): Signer;
export function getProvider(signer: Signer | undefined, chainId: number): ethers.JsonRpcProvider | Signer;
export function getProvider(signer: Signer | undefined, _chainId: number): ethers.JsonRpcProvider | Signer {
  if (signer) {
    return signer;
  }

  // Base-only RPC URL
  const url = "https://mainnet.base.org";
  const network = Network.from(BASE);

  return new ethers.JsonRpcProvider(url, BASE, { staticNetwork: network });
}

// Removed getWsProvider - websockets not needed for Privy/prediction markets

export function getFallbackProvider(_chainId: number) {
  // Base-only fallback provider
  const providerUrl = getFallbackRpcUrl(BASE);

  return new ethers.JsonRpcProvider(providerUrl, BASE, {
    staticNetwork: Network.from(BASE),
  });
}

// Removed useJsonRpcProvider - not needed for simplified Base-only setup

// Removed all websocket-related functions - not needed for Privy/prediction markets
