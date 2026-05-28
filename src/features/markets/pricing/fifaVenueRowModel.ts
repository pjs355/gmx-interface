import type { SnapshotStatus } from "@/types/odds-monitor";

/** Cross-venue row for FIFA 3-way moneyline (home | draw | away YES asks). */
export type FifaVenueRowModel = {
	id: string;
	label: string;
	linked: boolean;
	askHome: number | null;
	askDraw: number | null;
	askAway: number | null;
	statusHome?: SnapshotStatus;
	statusDraw?: SnapshotStatus;
	statusAway?: SnapshotStatus;
};

export type FifaThreeWayColumns = {
	home: string;
	draw: string;
	away: string;
};
