import { defineError } from "../types";

/** Trade box button / pre-flight (venue-agnostic). */
export const BTN_ENTER_AMOUNT = defineError("BTN_ENTER_AMOUNT", "Enter amount");
export const BTN_NOT_ENOUGH_SHARES = defineError("BTN_NOT_ENOUGH_SHARES", "Not enough shares");
export const BTN_NO_SHARES_TO_SELL = defineError("BTN_NO_SHARES_TO_SELL", "No shares to sell");
export const BTN_FETCHING_PRICE = defineError("BTN_FETCHING_PRICE", "Fetching price...");
export const BTN_NO_SHARES_AVAILABLE = defineError(
	"BTN_NO_SHARES_AVAILABLE",
	"No shares available",
);
export const BTN_NO_BIDS_AVAILABLE = defineError("BTN_NO_BIDS_AVAILABLE", "No bids available");
export const BTN_NOT_ENOUGH_BIDS_TO_SELL = defineError(
	"BTN_NOT_ENOUGH_BIDS_TO_SELL",
	"Not enough bids to sell",
);
export const BTN_REFRESHING_VENUE_PRICES = defineError(
	"BTN_REFRESHING_VENUE_PRICES",
	"Refreshing venue prices…",
);
