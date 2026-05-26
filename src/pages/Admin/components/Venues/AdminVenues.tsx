import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { ALL_VENUES, VENUE_LABELS, type VenueId } from "@/config/venues";
import { useEnabledVenues } from "@/context/EnabledVenuesContext";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { adminErrorMessage, ADMIN_MISSING_ACCESS_TOKEN } from "@/errors";

interface PutResponse {
	success: boolean;
	data?: { enabledVenues?: unknown };
	error?: string;
}

async function putEnabledVenues(enabled: VenueId[], token: string): Promise<VenueId[]> {
	const base = getPredictionApiBaseUrl();
	const res = await fetch(`${base}/admin/settings/enabled-venues`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ enabledVenues: enabled }),
	});
	const text = await res.text();
	let body: PutResponse | null = null;
	if (text.length > 0) {
		try {
			body = JSON.parse(text) as PutResponse;
		} catch (err) {
			console.error("error", err);
			throw new Error(
				`Failed to parse PUT /admin/settings/enabled-venues response: HTTP ${res.status}`,
			);
		}
	}
	if (!res.ok || !body || body.success !== true) {
		const detail = body?.error ?? `HTTP ${res.status}`;
		throw new Error(detail);
	}
	const list = body.data?.enabledVenues;
	if (!Array.isArray(list)) {
		throw new Error("PUT /admin/settings/enabled-venues response missing enabledVenues array");
	}
	const out: VenueId[] = [];
	for (const entry of list) {
		if (typeof entry === "string" && (ALL_VENUES as readonly string[]).includes(entry)) {
			out.push(entry as VenueId);
		}
	}
	return out;
}

export default function AdminVenues() {
	const { getAccessToken } = usePrivy();
	const { enabledVenues, isLoading, error, refresh } = useEnabledVenues();

	const [optimistic, setOptimistic] = useState<ReadonlySet<VenueId> | null>(null);
	const [pendingVenue, setPendingVenue] = useState<VenueId | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	useEffect(() => {
		if (pendingVenue !== null) return;
		setOptimistic(null);
	}, [enabledVenues, pendingVenue]);

	const effective = optimistic ?? enabledVenues;

	const handleToggle = useCallback(
		async (venue: VenueId) => {
			if (pendingVenue !== null) return;
			const next = new Set<VenueId>(effective);
			if (next.has(venue)) {
				next.delete(venue);
			} else {
				next.add(venue);
			}
			setOptimistic(next);
			setPendingVenue(venue);
			setSubmitError(null);
			try {
				const token = await getAccessToken();
				if (typeof token !== "string" || token.length === 0) {
					throw new Error(adminErrorMessage(ADMIN_MISSING_ACCESS_TOKEN));
				}
				await putEnabledVenues(Array.from(next), token);
				await refresh();
				setOptimistic(null);
			} catch (err) {
				console.error("error", err);
				setOptimistic(null);
				setSubmitError(err instanceof Error ? err.message : "Failed to update enabled venues");
			} finally {
				setPendingVenue(null);
			}
		},
		[effective, getAccessToken, pendingVenue, refresh],
	);

	const venues = useMemo(() => [...ALL_VENUES], []);

	return (
		<div style={{ padding: 12, color: "white" }}>
			<div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Enabled venues</div>
			<div
				style={{
					marginBottom: 12,
					color: "#9ca3af",
					maxWidth: 720,
					lineHeight: 1.4,
				}}
			>
				Click a venue to toggle it on or off for every user. Disabled venues disappear from the home
				cards, charts, orderbooks, and the trade box within ~30 seconds for other users (immediately
				for you). The setting is stored on predictions-api as a singleton document.
			</div>

			{isLoading && (
				<div style={{ marginBottom: 12, color: "#9ca3af" }}>Loading current setting…</div>
			)}

			{error && (
				<div
					style={{
						marginBottom: 12,
						padding: 8,
						border: "1px solid #f87171",
						borderRadius: 6,
						color: "#fecaca",
						background: "rgba(248,113,113,0.08)",
					}}
				>
					Failed to read enabled venues from predictions-api: {error}.
					<br />
					New users may see all venues until this load succeeds. Refresh the page after fixing the
					network or API.
				</div>
			)}

			{submitError && (
				<div
					style={{
						marginBottom: 12,
						padding: 8,
						border: "1px solid #f87171",
						borderRadius: 6,
						color: "#fecaca",
						background: "rgba(248,113,113,0.08)",
					}}
				>
					Update failed: {submitError}
				</div>
			)}

			<div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
				{venues.map((venue) => {
					const isEnabled = effective.has(venue);
					const isPending = pendingVenue === venue;
					return (
						<button
							key={venue}
							type="button"
							disabled={pendingVenue !== null}
							onClick={() => {
								void handleToggle(venue);
							}}
							style={{
								minWidth: 160,
								padding: "10px 16px",
								borderRadius: 8,
								border: isEnabled ? "1px solid #22c55e" : "1px solid #ef4444",
								background: isEnabled ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.10)",
								color: isEnabled ? "#bbf7d0" : "#fecaca",
								cursor: pendingVenue !== null ? "not-allowed" : "pointer",
								opacity: pendingVenue !== null && !isPending ? 0.7 : 1,
								fontWeight: 600,
								letterSpacing: 0.2,
							}}
						>
							<div style={{ fontSize: 16 }}>{VENUE_LABELS[venue]}</div>
							<div
								style={{
									fontSize: 12,
									marginTop: 4,
									opacity: 0.85,
								}}
							>
								{isPending
									? "Saving…"
									: isEnabled
										? "Enabled — click to disable"
										: "Disabled — click to enable"}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
