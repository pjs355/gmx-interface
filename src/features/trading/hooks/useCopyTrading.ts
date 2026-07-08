import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "./usePrivateApiClient";
import type {
	CopySettingsJson,
	CreateCopySubscriptionBody,
	StopCopySubscriptionBody,
} from "@/features/trading/copy/copyTypes";

const copyKeys = {
	active: ["copy", "active"] as const,
	detail: (id: string) => ["copy", "detail", id] as const,
	settings: ["copy", "settings"] as const,
};

export function useCopyActiveSubscription(opts: { enabled?: boolean } = {}) {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	return useQuery({
		queryKey: copyKeys.active,
		queryFn: () => api.getCopyActive(),
		enabled: (opts.enabled ?? true) && authenticated,
		// Funding runs in the background after activation. Poll fast while the
		// subscription is `activating` so the UI flips to "live" (or surfaces a
		// funding failure) promptly, then back off once it settles.
		refetchInterval: (query) => (query.state.data?.status === "activating" ? 3_000 : 15_000),
		staleTime: 2_000,
	});
}

export function useCopyDetail(subscriptionId: string | undefined) {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	return useQuery({
		queryKey: copyKeys.detail(subscriptionId ?? ""),
		queryFn: () => api.getCopyDetail(subscriptionId as string),
		enabled: authenticated && Boolean(subscriptionId),
		// Poll fast while funding so the dashboard reflects going-live promptly.
		refetchInterval: (query) =>
			query.state.data?.subscription.status === "activating" ? 3_000 : 15_000,
	});
}

export function useCopySettings(opts: { enabled?: boolean } = {}) {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	return useQuery({
		queryKey: copyKeys.settings,
		queryFn: () => api.getCopySettings(),
		enabled: (opts.enabled ?? true) && authenticated,
		staleTime: 60_000,
	});
}

export function useCreateCopySubscription() {
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: CreateCopySubscriptionBody) => api.postCopySubscription(body),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: copyKeys.active });
		},
	});
}

export function useStopCopySubscription() {
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { subscriptionId: string; body: StopCopySubscriptionBody }) =>
			api.postCopyStop(input.subscriptionId, input.body),
		onSuccess: (_data, vars) => {
			void queryClient.invalidateQueries({ queryKey: copyKeys.active });
			void queryClient.invalidateQueries({
				queryKey: copyKeys.detail(vars.subscriptionId),
			});
		},
	});
}

export function useResumeCopySubscription() {
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (subscriptionId: string) => api.postCopyResume(subscriptionId),
		onSuccess: (_data, subscriptionId) => {
			void queryClient.invalidateQueries({ queryKey: copyKeys.active });
			void queryClient.invalidateQueries({ queryKey: copyKeys.detail(subscriptionId) });
		},
	});
}

export function useUpdateCopySettings() {
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: Partial<CopySettingsJson>) => api.patchCopySettings(body),
		onSuccess: (data) => {
			queryClient.setQueryData(copyKeys.settings, data);
		},
	});
}
