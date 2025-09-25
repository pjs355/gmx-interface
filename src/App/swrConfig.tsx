import type { Cache, SWRConfiguration } from "swr";

export let swrCache: Cache = new Map();

export const SWRConfigProp: SWRConfiguration = {
  refreshInterval: 10000, // 10 seconds
  refreshWhenHidden: false,
  refreshWhenOffline: false,
  provider: () => {
    swrCache = new Map();
    return swrCache;
  },
};
