import { TradingShellProvider } from "@/trading/TradingShellContext";
import { TradingShellLayout } from "@/trading/shell/TradingShellLayout";

export default function TradingShellPage() {
	return (
		<TradingShellProvider>
			<TradingShellLayout />
		</TradingShellProvider>
	);
}
