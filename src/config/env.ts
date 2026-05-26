// Simple env config for LevelUp Predictions
export function isDevelopment() {
	return import.meta.env.DEV;
}

export function isProduction() {
	return import.meta.env.PROD;
}
