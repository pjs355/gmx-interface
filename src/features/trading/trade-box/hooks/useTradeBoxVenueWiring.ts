/**
 * Re-export — import `useTradeBoxVenueWiring` from here or from `./venueWiring/`.
 *
 * Keeps existing import paths stable after splitting the monolith into
 * sessions / orderbook / trading-gates modules.
 */
export {
	useTradeBoxVenueWiring,
	type UseTradeBoxVenueWiringParams,
} from "./venueWiring/useTradeBoxVenueWiring";
