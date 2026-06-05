import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { OddsDisplayProvider, useOddsDisplay } from "@/context/OddsDisplayContext";
import { ODDS_DISPLAY_STYLE_STORAGE_KEY } from "@/config/localStorage";
import { useOddsFormatUrlSync } from "../useOddsFormatUrlSync";

type HarnessSnapshot = {
	oddsDisplayStyle: ReturnType<typeof useOddsDisplay>["oddsDisplayStyle"];
	setOddsDisplayStyle: ReturnType<typeof useOddsDisplay>["setOddsDisplayStyle"];
	formatParam: string | null;
};

const snapshot: { current: HarnessSnapshot | null } = { current: null };

function Harness() {
	useOddsFormatUrlSync();
	const { oddsDisplayStyle, setOddsDisplayStyle } = useOddsDisplay();
	const [searchParams] = useSearchParams();
	snapshot.current = {
		oddsDisplayStyle,
		setOddsDisplayStyle,
		formatParam: searchParams.get("format"),
	};
	return null;
}

function TestRouter({ initialEntry }: { initialEntry: string }) {
	return (
		<MemoryRouter initialEntries={[initialEntry]}>
			<OddsDisplayProvider>
				<Routes>
					<Route path="/predictions/umbrella/:id" element={<Harness />} />
				</Routes>
			</OddsDisplayProvider>
		</MemoryRouter>
	);
}

describe("useOddsFormatUrlSync", () => {
	beforeEach(() => {
		snapshot.current = null;
		localStorage.clear();
	});

	it("updates context and URL when odds menu changes format with stale ?format= in address bar", async () => {
		localStorage.setItem(ODDS_DISPLAY_STYLE_STORAGE_KEY, "american");
		renderHook(() => null, {
			wrapper: () => <TestRouter initialEntry="/predictions/umbrella/test-id?format=american" />,
		});

		await waitFor(() => {
			expect(snapshot.current?.oddsDisplayStyle).toBe("american");
			expect(snapshot.current?.formatParam).toBe("american");
		});

		act(() => {
			snapshot.current?.setOddsDisplayStyle("decimal");
		});

		await waitFor(() => {
			expect(snapshot.current?.oddsDisplayStyle).toBe("decimal");
			expect(snapshot.current?.formatParam).toBe("decimal");
		});
	});
});
