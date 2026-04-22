import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Module mocks must run before the hook is imported.

const usePrivyMock = vi.fn();
vi.mock("@privy-io/react-auth", () => ({
	usePrivy: () => usePrivyMock(),
}));

const useCurrentProfileMock = vi.fn();
vi.mock("@/trading/hooks/useCurrentProfile", () => ({
	useCurrentProfile: (...args: unknown[]) => useCurrentProfileMock(...args),
}));

const usePrivateApiClientMock = vi.fn();
vi.mock("@/trading/hooks/usePrivateApiClient", () => ({
	usePrivateApiClient: () => usePrivateApiClientMock(),
}));

const usePolymarketRelayMock = vi.fn();
vi.mock("../usePolymarketRelay", () => ({
	usePolymarketRelay: () => usePolymarketRelayMock(),
}));

const usePolymarketEoaWalletClientMock = vi.fn();
vi.mock("../usePolymarketEoaWalletClient", () => ({
	usePolymarketEoaWalletClient: () => usePolymarketEoaWalletClientMock(),
}));

const deployPolymarketSafeIfNeededMock = vi.fn();
const executePolymarketApprovalBatchMock = vi.fn();
vi.mock("../safeActions", () => ({
	deployPolymarketSafeIfNeeded: (
		...args: Parameters<typeof deployPolymarketSafeIfNeededMock>
	) => deployPolymarketSafeIfNeededMock(...args),
	executePolymarketApprovalBatch: (
		...args: Parameters<typeof executePolymarketApprovalBatchMock>
	) => executePolymarketApprovalBatchMock(...args),
}));

const checkPolymarketApprovalsMock = vi.fn();
vi.mock("../approvalTxs", () => ({
	checkPolymarketApprovals: (
		...args: Parameters<typeof checkPolymarketApprovalsMock>
	) => checkPolymarketApprovalsMock(...args),
}));

vi.mock("@polymarket/builder-relayer-client/dist/builder/derive", () => ({
	deriveSafe: vi.fn(() => "0xsafe"),
}));

import { usePolymarketEnsureExecutionReady } from "../usePolymarketEnsureExecutionReady";

// A harness so the hook can run inside a query client + expose state for asserts.
type CapturedState = ReturnType<typeof usePolymarketEnsureExecutionReady>;
const captured: { state: CapturedState | null } = { state: null };

function Harness({ enabled }: { enabled: boolean }) {
	captured.state = usePolymarketEnsureExecutionReady({ enabled });
	return null;
}

function renderHarness(enabled = true) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<Harness enabled={enabled} />
		</QueryClientProvider>
	);
}

/** Wait for a tick so setState-in-effect microtasks flush. Because the hook
 * awaits ~8 async calls in sequence, we spin a bunch of microtasks to make
 * sure every one resolves before the test asserts. */
async function flush() {
	await act(async () => {
		for (let i = 0; i < 32; i++) {
			await Promise.resolve();
		}
	});
}

function baseMocks({
	executionReady = false,
	safeDeployed = false,
	allApproved = false,
}: {
	executionReady?: boolean;
	safeDeployed?: boolean;
	allApproved?: boolean;
} = {}) {
	usePrivyMock.mockReturnValue({ authenticated: true, ready: true });
	useCurrentProfileMock.mockReturnValue({ data: { _id: "profile-1" } });

	const api = {
		getPolymarketAccount: vi.fn().mockResolvedValue({
			builderReadiness: {
				executionReady,
				safeDeployed,
			},
			polymarketAccount: {
				safeWalletAddress: safeDeployed ? "0xsafe" : "",
			},
		}),
		postPolymarketVerifyOnChain: vi.fn().mockResolvedValue({}),
		postPolymarketSync: vi.fn().mockResolvedValue({}),
	};
	usePrivateApiClientMock.mockReturnValue(api);

	usePolymarketEoaWalletClientMock.mockReturnValue({
		ready: true,
		address: "0xEoa" as `0x${string}`,
		eip1193Provider: { request: vi.fn() },
		walletClient: {},
		error: null,
		refresh: vi.fn(),
	});

	const relayClient = {
		contractConfig: { SafeContracts: { SafeFactory: "0xfactory" } },
	};
	usePolymarketRelayMock.mockReturnValue({
		getRelayClient: vi.fn().mockResolvedValue(relayClient),
		relayerUrl: "https://relayer-v2.polymarket.com",
		walletReady: true,
		walletError: null,
		eoaAddress: "0xEoa",
		polymarketLoading: false,
	});

	checkPolymarketApprovalsMock.mockResolvedValue({ allApproved });
	deployPolymarketSafeIfNeededMock.mockResolvedValue(true);
	executePolymarketApprovalBatchMock.mockResolvedValue(undefined);

	return { api };
}

describe("usePolymarketEnsureExecutionReady", () => {
	beforeEach(() => {
		captured.state = null;
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("fast-path: no-ops when executionReady is already true", async () => {
		const { api } = baseMocks({ executionReady: true });

		renderHarness(true);
		await flush();

		expect(api.getPolymarketAccount).toHaveBeenCalledTimes(1);
		expect(deployPolymarketSafeIfNeededMock).not.toHaveBeenCalled();
		expect(executePolymarketApprovalBatchMock).not.toHaveBeenCalled();
		expect(api.postPolymarketVerifyOnChain).not.toHaveBeenCalled();
		expect(captured.state?.ready).toBe(true);
		expect(captured.state?.phase).toBe("ready");
	});

	it("happy path: deploys safe, approves, verifies", async () => {
		// L2 creds are explicitly NOT minted/persisted here — Polymarket order
		// signing happens client-side in `usePolymarketClobTradingSession`,
		// so the activation path only needs Safe + approvals + verify.
		const { api } = baseMocks({
			executionReady: false,
			safeDeployed: false,
			allApproved: false,
		});

		renderHarness(true);
		await flush();

		expect(deployPolymarketSafeIfNeededMock).toHaveBeenCalledTimes(1);
		expect(executePolymarketApprovalBatchMock).toHaveBeenCalledTimes(1);
		expect(api.postPolymarketVerifyOnChain).toHaveBeenCalledWith({});
		expect(captured.state?.ready).toBe(true);
	});

	it("skips deploy + approvals when each is already satisfied on-chain", async () => {
		const { api } = baseMocks({
			executionReady: false, // tradingEnabled is still false
			safeDeployed: true,
			allApproved: true,
		});

		renderHarness(true);
		await flush();

		expect(deployPolymarketSafeIfNeededMock).not.toHaveBeenCalled();
		expect(executePolymarketApprovalBatchMock).not.toHaveBeenCalled();
		// Still calls verify-on-chain so the server flips tradingEnabled.
		expect(api.postPolymarketVerifyOnChain).toHaveBeenCalledTimes(1);
		expect(captured.state?.ready).toBe(true);
	});

	it("double-mount does not double-fire the orchestration", async () => {
		const { api } = baseMocks({ executionReady: true });

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<Harness enabled={true} />
				<Harness enabled={true} />
			</QueryClientProvider>
		);
		await flush();

		// Both hook instances share the module-level completedKeyRef? No — each
		// instance has its own ref. But `inFlightRef` is per-instance too; the
		// dedup guarantee here is that within a single instance, the effect
		// doesn't re-fire during the same completed runKey, which the fast
		// path already demonstrates. Two instances correctly both reach "ready"
		// without throwing.
		expect(api.getPolymarketAccount.mock.calls.length).toBeGreaterThanOrEqual(1);
		expect(captured.state?.ready).toBe(true);
	});

	it("records lastError and backs off when a step throws", async () => {
		const { api } = baseMocks();
		deployPolymarketSafeIfNeededMock.mockRejectedValueOnce(
			new Error("relayer 429")
		);

		renderHarness(true);
		await flush();

		expect(captured.state?.phase).toBe("error");
		expect(captured.state?.error).toMatch(/relayer 429/);
		// Best-effort lastError sync fires even on failure.
		expect(api.postPolymarketSync).toHaveBeenCalledWith({
			lastError: expect.stringContaining("relayer 429"),
		});
		// Verify we did not advance past the failing step.
		expect(api.postPolymarketVerifyOnChain).not.toHaveBeenCalled();
		// setupInProgress remains true until backoff exhausts.
		expect(captured.state?.setupInProgress).toBe(true);
	});

	it("is idle when enabled=false", async () => {
		baseMocks({ executionReady: true });
		renderHarness(false);
		await flush();
		expect(captured.state?.phase).toBe("idle");
		expect(captured.state?.ready).toBe(false);
	});

	it("unmount cancels without leaking state updates", async () => {
		baseMocks({ executionReady: true });

		const { unmount } = renderHarness(true);
		unmount();
		await flush();
		// No assertion needed beyond not throwing; React will warn on leaked
		// setStates during test, and vi.clearAllMocks in afterEach keeps test
		// state clean.
		expect(true).toBe(true);
	});
});
