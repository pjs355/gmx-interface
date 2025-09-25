// Simplified localStorage configuration for prediction markets
export const CURRENT_PROVIDER_LOCALSTORAGE_KEY = "CURRENT_PROVIDER";
export const SHOULD_EAGER_CONNECT_LOCALSTORAGE_KEY = "SHOULD_EAGER_CONNECT";

export const CURRENT_POOL_KEY = "current-pool";
export const REDIRECT_POPUP_TIMESTAMP_KEY = "redirect-popup-timestamp";

// Prediction market specific keys
export const SELECTED_NETWORK_LOCAL_STORAGE_KEY = "SELECTED_NETWORK";
export const WALLET_CONNECT_LOCALSTORAGE_KEY = "walletconnect";
export const WALLET_LINK_LOCALSTORAGE_PREFIX = "WALLET_LINK";

// UI preferences
export const LANGUAGE_LOCALSTORAGE_KEY = "LANGUAGE";
export const SHOW_DEBUG_VALUES_KEY = "show-debug-values";

export function useLocalStorageSerializeKey<T>(
  key: string,
  defaultValue: T,
  options?: { deserializer?: (value: string) => T; serializer?: (value: T) => string }
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
