import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
			/**
			 * In dev, refetch-on-focus causes a second burst of identical requests when
			 * switching to DevTools or another tab (e.g. `/positions` “reloads” visually).
			 * Production keeps the default refresh-on-focus so returning to the tab still
			 * reconciles stale TanStack data with the server.
			 */
			refetchOnWindowFocus: import.meta.env.PROD,
		},
	},
});

export default function WalletProvider({ children }: { children: ReactNode }) {
	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

export { queryClient };
