import { ARBITRUM, AVALANCHE, BASE } from "config/chains";

export type VolumeInfo = {
  totalVolume: bigint;
  [AVALANCHE]: { totalVolume: bigint };
  [ARBITRUM]: { totalVolume: bigint };
  [BASE]: { totalVolume: bigint };
};

export type VolumeStat = {
  swap: string;
  margin: string;
  liquidation: string;
  mint: string;
  burn: string;
};
