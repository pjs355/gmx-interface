import mixpanel from "mixpanel-browser";

// Check if we're on localhost
const isLocalhost = () => {
	if (typeof window === "undefined") return false;
	return (
		window.location.hostname === "localhost" ||
		window.location.hostname === "127.0.0.1" ||
		window.location.hostname === "[::1]"
	);
};

// Wrapper for mixpanel that disables tracking on localhost
export const mixpanelTrack = (eventName: string, properties?: Record<string, any>) => {
	if (isLocalhost()) {
		return;
	}
	try {
		mixpanel.track(eventName, properties);
	} catch (error) {
		console.error("error", error);
	}
};

export const mixpanelIdentify = (userId: string) => {
	if (isLocalhost()) {
		return;
	}
	try {
		mixpanel.identify(userId);
	} catch (error) {
		console.error("error", error);
	}
};

export const mixpanelPeopleSet = (properties: Record<string, any>) => {
	if (isLocalhost()) {
		return;
	}
	try {
		mixpanel.people.set(properties);
	} catch (error) {
		console.error("error", error);
	}
};

// Initialize mixpanel only if not on localhost
export const initMixpanel = (token: string, options?: any) => {
	if (isLocalhost()) {
		return;
	}
	try {
		mixpanel.init(token, options);
	} catch (error) {
		console.error("error", error);
	}
};
