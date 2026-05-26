// Simplified localStorage configuration for prediction markets
export const CURRENT_PROVIDER_LOCALSTORAGE_KEY = "CURRENT_PROVIDER";
export const SHOULD_EAGER_CONNECT_LOCALSTORAGE_KEY = "SHOULD_EAGER_CONNECT";

export const CURRENT_POOL_KEY = "current-pool";
export const REDIRECT_POPUP_TIMESTAMP_KEY = "redirect-popup-timestamp";

// Prediction market specific keys
export const SELECTED_NETWORK_LOCAL_STORAGE_KEY = "SELECTED_NETWORK";

// UI preferences
export const LANGUAGE_LOCALSTORAGE_KEY = "LANGUAGE";
export const SHOW_DEBUG_VALUES_KEY = "show-debug-values";
/** `"default"` | `"american"` — extensible for decimal/fractional later */
export const ODDS_DISPLAY_STYLE_STORAGE_KEY = "odds-display-style";

// Debug: Override the account address for read-only debugging
// Set this to another user's wallet address to view their portfolio (read-only)
// Usage: localStorage.setItem('DEBUG_ACCOUNT_OVERRIDE', '0x...')
// Clear: localStorage.removeItem('DEBUG_ACCOUNT_OVERRIDE')
export const DEBUG_ACCOUNT_OVERRIDE_KEY = "DEBUG_ACCOUNT_OVERRIDE";

export function useLocalStorageSerializeKey<T>(
	key: string,
	defaultValue: T,
	options?: {
		deserializer?: (value: string) => T;
		serializer?: (value: T) => string;
	},
): [T, (value: T) => void] {
	const serializer = options?.serializer || JSON.stringify;
	const deserializer = options?.deserializer || JSON.parse;

	const storedValue = localStorage.getItem(key);
	const initial = storedValue ? deserializer(storedValue) : defaultValue;

	const setValue = (value: T) => {
		localStorage.setItem(key, serializer(value));
	};

	return [initial, setValue];
}
