import React, { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { mixpanelIdentify, mixpanelPeopleSet } from "@/shared/analytics/mixpanel";

/** Mixpanel identify only — trading data lives in AccountData and venue hooks. */
export function UserDataProvider({ children }: { children: React.ReactNode }) {
	const { user } = usePrivy();
	const mixpanelIdentifiedRef = useRef<string | null>(null);

	useEffect(() => {
		if (!user || !user.id) {
			mixpanelIdentifiedRef.current = null;
			return;
		}

		if (mixpanelIdentifiedRef.current === user.id) return;

		try {
			mixpanelIdentify(user.id);

			const email =
				user.email?.address ||
				user.google?.email ||
				(user.twitter as { email?: string } | undefined)?.email ||
				null;
			const name =
				(user as { name?: string }).name ||
				user.google?.name ||
				(user.twitter as { name?: string } | undefined)?.name ||
				null;

			mixpanelPeopleSet({
				$name: name || undefined,
				$email: email || undefined,
			});

			mixpanelIdentifiedRef.current = user.id;
		} catch (error) {
			console.error("error", error);
		}
	}, [user]);

	return <>{children}</>;
}
