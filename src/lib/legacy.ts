// Legacy utility functions for LevelUp Predictions

export function isHomeSite() {
  return import.meta.env.VITE_APP_IS_HOME_SITE === "true";
}

export function getAppBaseUrl() {
  return import.meta.env.VITE_APP_BASE_URL || "";
}

export function getHomeUrl() {
  return import.meta.env.VITE_HOME_URL || "";
}

export function shouldShowRedirectModal(redirectPopupTimestamp: number) {
  // Simple implementation - can be enhanced later
  return false;
}

export function getAccountUrl(account: string) {
  return `${getAppBaseUrl()}/account/${account}`;
}
