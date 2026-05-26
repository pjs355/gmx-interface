import type { SnapshotStatus } from "@/types/odds-monitor";

export type VenueRowModel = {
	id: string;
	label: string;
	linked: boolean;
	askA: number | null;
	askB: number | null;
	/** Best bid on outcome A / Team A (sell YES). */
	bidA: number | null;
	/** Best bid on outcome B / Team B (sell NO). */
	bidB: number | null;
	statusA?: SnapshotStatus;
	statusB?: SnapshotStatus;
};
