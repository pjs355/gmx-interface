import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useLocation, useNavigate } from "react-router-dom";

import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";

/**
 * After Proof redirects back with `?dflow_proof=1` on any route, sync KYC with the API
 * and strip the param (same behavior as the old Profile-only handler).
 */
export function DflowProofReturnSync() {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	const queryClient = useQueryClient();
	const location = useLocation();
	const navigate = useNavigate();

	const isProofReturn = useMemo(
		() => new URLSearchParams(location.search).get("dflow_proof") === "1",
		[location.search],
	);

	useQuery({
		queryKey: ["dflow", "verify-on-return", location.pathname, location.search],
		queryFn: async () => {
			const result = await api.getDflowVerify();
			if (result.verified) {
				await queryClient.invalidateQueries({ queryKey: ["dflow", "account"] });
			}
			const params = new URLSearchParams(location.search);
			params.delete("dflow_proof");
			const qs = params.toString();
			navigate(`${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`, {
				replace: true,
			});
			return result;
		},
		enabled: authenticated && isProofReturn,
		staleTime: Infinity,
		retry: false,
	});

	return null;
}
