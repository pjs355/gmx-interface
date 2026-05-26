import type { VenueRowModel } from "@/features/markets/pricing/venueRowModel";

/** Lowest Team A / Team B ask across linked venue rows → home-card YES / NO. */
export function bestCrossVenueYesNoFromRows(rows: VenueRowModel[]): {
	yes: number | null;
	no: number | null;
} {
	let bestYes = Infinity;
	let bestNo = Infinity;
	for (const r of rows) {
		if (!r.linked) continue;
		if (r.askA !== null && r.askA < bestYes) bestYes = r.askA;
		if (r.askB !== null && r.askB < bestNo) bestNo = r.askB;
	}
	return {
		yes: bestYes === Infinity ? null : bestYes,
		no: bestNo === Infinity ? null : bestNo,
	};
}
