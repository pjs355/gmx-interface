import { useMemo } from "react";
import { useAccountOverviewSlice } from "@/context/AccountDataContext";
import type { VenueSetupLookupKey } from "./venueSetup";
import { findVenueSetup } from "./venueSetup";
import type { VenueSetupSlice } from "@/types/trading/venueSetup";

/**
 * Read-only venue setup from cached `GET /account-overview` (`venues[].setup`).
 * Use {@link useVenueTokenApprovals} for on-chain token approval state.
 */
export function useVenueSetup(venue: VenueSetupLookupKey): VenueSetupSlice | null {
	const overview = useAccountOverviewSlice();
	return useMemo(() => findVenueSetup(overview.data, venue), [overview.data, venue]);
}
