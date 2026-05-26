import { useMutation } from "@tanstack/react-query";
import { usePrivateApiClient } from "./usePrivateApiClient";
import type { LifiQuoteRequestBody } from "@/types/trading";

export function useLifiQuoteMutation() {
	const api = usePrivateApiClient();
	return useMutation({
		mutationFn: (body: LifiQuoteRequestBody) => api.postFundingLifiQuote(body),
	});
}
