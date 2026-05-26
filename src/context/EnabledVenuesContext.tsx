import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ALL_VENUES, isVenueId, type VenueId } from "@/config/venues";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

const POLL_INTERVAL_MS = 30_000;

export interface EnabledVenuesContextValue {
	/** Set of venue ids the admin currently allows to display + trade. */
	enabledVenues: ReadonlySet<VenueId>;
	/** Stable callback for hot paths. */
	isVenueEnabled: (venue: VenueId) => boolean;
	/** Force-refresh the singleton document (called by admin toggle UI on success). */
	refresh: () => Promise<void>;
	/** True before the very first response lands (no cached value yet). */
	isLoading: boolean;
	/** Fetch error string when we have no cached value to fall back on. */
	error: string | null;
}

const EnabledVenuesContext = createContext<EnabledVenuesContextValue | null>(null);

interface EnabledVenuesResponse {
	success: boolean;
	data?: {
		enabledVenues?: unknown;
	};
	error?: string;
}

function parseEnabledVenuesPayload(payload: unknown): VenueId[] {
	if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
		throw new Error("enabled-venues response is malformed (expected an object body)");
	}
	const body = payload as EnabledVenuesResponse;
	if (body.success !== true || !body.data) {
		const detail = typeof body.error === "string" ? body.error : "unknown";
		throw new Error(`enabled-venues response not successful: ${detail}`);
	}
	const list = body.data.enabledVenues;
	if (!Array.isArray(list)) {
		throw new Error("enabled-venues response missing data.enabledVenues array");
	}
	const result: VenueId[] = [];
	for (const entry of list) {
		if (isVenueId(entry) && !result.includes(entry)) {
			result.push(entry);
		}
	}
	return result;
}

async function fetchEnabledVenues(signal?: AbortSignal): Promise<VenueId[]> {
	const base = getPredictionApiBaseUrl();
	const url = `${base}/settings/enabled-venues`;
	const res = await fetch(url, {
		method: "GET",
		headers: { Accept: "application/json" },
		signal,
		cache: "no-store",
	});
	if (!res.ok) {
		throw new Error(`GET /settings/enabled-venues failed: HTTP ${res.status} ${res.statusText}`);
	}
	const json = (await res.json()) as unknown;
	return parseEnabledVenuesPayload(json);
}

export function EnabledVenuesProvider({ children }: { children: React.ReactNode }) {
	const [enabledList, setEnabledList] = useState<VenueId[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const inFlightRef = useRef<AbortController | null>(null);

	const load = useCallback(async () => {
		const previous = inFlightRef.current;
		if (previous) {
			previous.abort();
		}
		const controller = new AbortController();
		inFlightRef.current = controller;
		try {
			const next = await fetchEnabledVenues(controller.signal);
			if (controller.signal.aborted) return;
			setEnabledList(next);
			setError(null);
		} catch (err) {
			if (controller.signal.aborted) return;
			console.error("error", err);
			const message = err instanceof Error ? err.message : "Failed to load enabled venues";
			setEnabledList((prev) => prev);
			setError(message);
		} finally {
			if (inFlightRef.current === controller) {
				inFlightRef.current = null;
			}
		}
	}, []);

	useEffect(() => {
		void load();
		const id = window.setInterval(() => {
			void load();
		}, POLL_INTERVAL_MS);
		return () => {
			window.clearInterval(id);
			const inflight = inFlightRef.current;
			if (inflight) {
				inflight.abort();
				inFlightRef.current = null;
			}
		};
	}, [load]);

	const enabledVenues = useMemo<ReadonlySet<VenueId>>(() => {
		if (enabledList === null) {
			return new Set<VenueId>(ALL_VENUES);
		}
		return new Set<VenueId>(enabledList);
	}, [enabledList]);

	const isVenueEnabled = useCallback((venue: VenueId) => enabledVenues.has(venue), [enabledVenues]);

	const value = useMemo<EnabledVenuesContextValue>(
		() => ({
			enabledVenues,
			isVenueEnabled,
			refresh: load,
			isLoading: enabledList === null && error === null,
			error: enabledList === null ? error : null,
		}),
		[enabledVenues, isVenueEnabled, load, enabledList, error],
	);

	return <EnabledVenuesContext.Provider value={value}>{children}</EnabledVenuesContext.Provider>;
}

export function useEnabledVenues(): EnabledVenuesContextValue {
	const ctx = useContext(EnabledVenuesContext);
	if (!ctx) {
		throw new Error("useEnabledVenues must be used within EnabledVenuesProvider");
	}
	return ctx;
}
