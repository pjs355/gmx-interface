// Simplified UI configuration for prediction markets
export const TOAST_CLOSE_TIME = 5000;
export const DEFAULT_HIGHER_SLIPPAGE_AMOUNT = 1;

export const TOAST_AUTO_CLOSE_TIME = 7000;

// Tooltip configuration
export const DEFAULT_TOOLTIP_POSITION = "top";
export const TOOLTIP_CLOSE_DELAY = 200;
export const TOOLTIP_OPEN_DELAY = 500;

// UI constants
export const UI = {
  DEPOSIT_MODAL_KEY: "deposit-modal",
  WITHDRAW_MODAL_KEY: "withdraw-modal",
} as const;

export function isHomeSite() {
  return window.location.host?.includes("levelup") || window.location.host?.includes("prinx");
}
