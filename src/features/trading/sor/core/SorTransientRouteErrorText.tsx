import { useAnimatedDots } from "@/shared/hooks/useAnimatedDots";

/** Keeps SOR `error` strings stable upstream while animating known loading copy. */
export function SorTransientRouteErrorText({ message }: { message: string }) {
	const dots = useAnimatedDots(400);
	if (message === "Fetching price..." || message === "Fetching price") {
		return <>Fetching price{dots}</>;
	}
	return <>{message}</>;
}
