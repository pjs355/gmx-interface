/**
 * Shared chart / merge types for multi-venue price series (timestamp unix seconds, price 0–1).
 * Historical venue fetches are performed by the predictions API batch route.
 */

export interface PricePoint {
	timestamp: number;
	price: number;
}
