import React, { useCallback, useLayoutEffect } from "react";
import { useFundWallet } from "@privy-io/react-auth";
import { isAddress } from "viem";

const BASE_MAINNET = 8453 as const;

type OpenFundFn = () => void | Promise<void>;

type WithFundWalletProps = {
	fundTo: `0x${string}`;
	children: (p: { openFund: OpenFundFn; canFund: boolean }) => React.ReactNode;
	onAfterFund?: () => void;
};

/**
 * Renders `children` with `useFundWallet` only when `fundTo` is a valid EVM address, so
 * Privy’s funding UI is not mounted with an undefined / non-EVM target (TEE + Solana case).
 */
function WithFundWallet({ fundTo, children, onAfterFund }: WithFundWalletProps) {
	const { fundWallet } = useFundWallet();
	const openFund = useCallback(async () => {
		try {
			await fundWallet({
				address: fundTo,
				options: { chain: { id: BASE_MAINNET } },
			});
			onAfterFund?.();
		} catch (e) {
			console.error("Fund wallet error:", e);
		}
	}, [fundTo, fundWallet, onAfterFund]);
	return <>{children({ openFund, canFund: true })}</>;
}

type PrivyGatedFundTriggerProps = {
	fundTarget: string | undefined;
	ready?: boolean;
	children: (p: { openFund: OpenFundFn; canFund: boolean }) => React.ReactNode;
	onAfterFund?: () => void;
};

export function PrivyGatedFundTrigger({
	fundTarget,
	ready = true,
	children,
	onAfterFund,
}: PrivyGatedFundTriggerProps) {
	const can = ready && Boolean(fundTarget) && isAddress(fundTarget as `0x${string}`);
	if (can) {
		return (
			<WithFundWallet fundTo={fundTarget as `0x${string}`} onAfterFund={onAfterFund}>
				{children}
			</WithFundWallet>
		);
	}
	return <>{children({ openFund: () => {}, canFund: false })}</>;
}

type GatedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	fundTarget: string | undefined;
	ready?: boolean;
	onAfterFund?: () => void;
};

/** Primary deposit button: mounts `useFundWallet` only when the target is a valid 0x address. */
export function PrivyGatedDepositButton({
	fundTarget,
	ready = true,
	onAfterFund,
	children,
	className,
	...rest
}: GatedButtonProps) {
	return (
		<PrivyGatedFundTrigger fundTarget={fundTarget} ready={ready} onAfterFund={onAfterFund}>
			{({ openFund, canFund }) => (
				<button
					type="button"
					{...rest}
					className={className}
					disabled={rest.disabled ?? !canFund}
					onClick={() => {
						if (canFund) void openFund();
					}}
				>
					{children}
				</button>
			)}
		</PrivyGatedFundTrigger>
	);
}

function SyncOpenFundToRef({
	canFund,
	openFund,
	fundActionRef,
}: {
	canFund: boolean;
	openFund: () => void | Promise<void>;
	fundActionRef: React.MutableRefObject<(() => void | Promise<void>) | null>;
}) {
	useLayoutEffect(() => {
		if (canFund) {
			fundActionRef.current = openFund;
		} else {
			fundActionRef.current = null;
		}
		return () => {
			fundActionRef.current = null;
		};
	}, [canFund, openFund, fundActionRef]);
	return null;
}

/**
 * Keeps a ref in sync with the gated `openFund` from `useFundWallet` so call sites
 * (e.g. an imperative "Add funds" handler) can trigger funding without always mounting
 * the hook in the same component.
 */
export function RegisterPrivyOpenFundAction({
	fundTarget,
	ready = true,
	onAfterFund,
	fundActionRef,
}: {
	fundTarget: string | undefined;
	ready?: boolean;
	onAfterFund?: () => void;
	fundActionRef: React.MutableRefObject<(() => void | Promise<void>) | null>;
}) {
	return (
		<PrivyGatedFundTrigger fundTarget={fundTarget} ready={ready} onAfterFund={onAfterFund}>
			{({ openFund, canFund }) => (
				<SyncOpenFundToRef canFund={canFund} openFund={openFund} fundActionRef={fundActionRef} />
			)}
		</PrivyGatedFundTrigger>
	);
}
