import { describe, expect, it } from "vitest";
import {
	captureAccountReconcileSnapshot,
	evidenceSnapshotChanged,
	type AccountReconcileSnapshot,
} from "../post-trade/postTradeReconcile";
import type { AccountVenueKey } from "@/context/AccountDataContext";
import type { VenuePosition } from "@/types/trading/venuePosition";

function emptyPositions(): Record<AccountVenueKey, { rows: VenuePosition[] }> {
	return {
		polymarket: { rows: [] },
		predict: { rows: [] },
		dflow: { rows: [] },
		limitless: { rows: [] },
	};
}

describe("postTradeReconcile", () => {
	it("captureAccountReconcileSnapshot includes venue sigs and LevelUp sides", () => {
		const positions = emptyPositions();
		positions.predict.rows = [
			{
				venue: "predictfun",
				tokenId: "123",
				shares: 5,
			} as VenuePosition,
		];
		const snap = captureAccountReconcileSnapshot({
			positions,
			cashTotal: 100,
			accountVersion: 3,
			readLevelUpSide: (mid, side) => (mid === "m1" && side === "yes" ? 2 : 0),
			levelUpMarketId: "m1",
		});
		expect(snap.cashTotal).toBe(100);
		expect(snap.accountVersion).toBe(3);
		expect(snap.levelUpYes).toBe(2);
		expect(snap.levelUpNo).toBe(0);
		expect(snap.venuePositionSigs.predict.length).toBeGreaterThan(0);
	});

	it("evidenceSnapshotChanged detects cash drift", () => {
		const a: AccountReconcileSnapshot = {
			accountVersion: 0,
			cashTotal: 100,
			venuePositionSigs: {
				polymarket: "",
				predict: "",
				dflow: "",
				limitless: "",
			},
			levelUpYes: null,
			levelUpNo: null,
		};
		const b: AccountReconcileSnapshot = {
			...a,
			cashTotal: 100.1,
		};
		expect(evidenceSnapshotChanged(a, b)).toBe(true);
	});

	it("evidenceSnapshotChanged is false when snapshots match", () => {
		const a: AccountReconcileSnapshot = {
			accountVersion: 1,
			cashTotal: 50,
			venuePositionSigs: {
				polymarket: "x:1.0000",
				predict: "",
				dflow: "",
				limitless: "",
			},
			levelUpYes: 1,
			levelUpNo: 2,
		};
		const b: AccountReconcileSnapshot = { ...a };
		expect(evidenceSnapshotChanged(a, b)).toBe(false);
	});
});
