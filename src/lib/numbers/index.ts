// Simplified number utilities for prediction markets - removed GMX SDK dependency

export const BASIS_POINTS_DIVISOR = 10000;
export const USD_DECIMALS = 30;

export function bigintToNumber(value: bigint): number {
  return Number(value);
}

export function formatRatePercentage(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

export function roundToOrder(value: number): number {
  return Math.round(value);
}
