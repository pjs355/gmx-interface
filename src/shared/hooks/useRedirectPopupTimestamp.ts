import { useState } from "react";

export function useRedirectPopupTimestamp() {
	const [timestamp, setTimestamp] = useState<number | null>(null);

	return {
		timestamp,
		setTimestamp,
		clear: () => setTimestamp(null),
	};
}
