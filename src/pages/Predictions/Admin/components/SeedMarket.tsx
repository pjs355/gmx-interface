import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "../../../../lib/predictionApiBase";

interface SeedMarketProps {
	questionId: string;
	questionDisplayName?: string;
}

interface SeedResult {
	seededNo: number;
	seededYes: number;
	levels: number;
	spread: number;
}

export default function SeedMarket({
	questionId,
	questionDisplayName,
}: SeedMarketProps) {
	const { getAccessToken } = usePrivy();
	const [minPrice, setMinPrice] = useState<string>("0.1");
	const [maxPrice, setMaxPrice] = useState<string>("0.9");
	const [amount, setAmount] = useState<string>("100");
	const [seeding, setSeeding] = useState<boolean>(false);
	const [clearing, setClearing] = useState<boolean>(false);
	const [result, setResult] = useState<SeedResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [clearResult, setClearResult] = useState<string | null>(null);

	const validateInputs = (): string | null => {
		const min = Number(minPrice);
		const max = Number(maxPrice);
		const amt = Number(amount);

		if (
			!Number.isFinite(min) ||
			!Number.isFinite(max) ||
			!Number.isFinite(amt)
		) {
			return "All values must be valid numbers";
		}

		if (!(min > 0) || !(max < 1) || !(max > min)) {
			return "Range must satisfy 0 < min < max < 1";
		}

		if (!(amt > 0)) {
			return "Amount must be a positive number";
		}

		return null;
	};

	const handleSeed = async () => {
		const validationError = validateInputs();
		if (validationError) {
			setError(validationError);
			return;
		}

		setSeeding(true);
		setError(null);
		setResult(null);

		try {
			const token =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;
			const base = getPredictionApiBaseUrl();

			const body = {
				range: [Number(minPrice), Number(maxPrice)],
				amount: Number(amount),
			};

			const response = await fetch(
				`${base}/admin/markets/seed/${questionId}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify(body),
				}
			);

			const json = await response.json().catch(() => ({} as any));

			if (!response.ok || !json?.success) {
				throw new Error(json?.error || `HTTP ${response.status}`);
			}

			setResult(json.data as SeedResult);
		} catch (err) {
			console.error("error", err);
			setError(
				err instanceof Error ? err.message : "Unknown error occurred"
			);
		} finally {
			setSeeding(false);
		}
	};

	const handleClear = async () => {
		setClearing(true);
		setError(null);
		setClearResult(null);

		try {
			const token =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;
			const base = getPredictionApiBaseUrl();

			const response = await fetch(
				`${base}/admin/markets/clear-book/${questionId}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
				}
			);

			const json = await response.json().catch(() => ({} as any));

			if (!response.ok || !json?.success) {
				throw new Error(json?.error || `HTTP ${response.status}`);
			}

			setClearResult("Order book cleared successfully");
		} catch (err) {
			console.error("error", err);
			setError(
				err instanceof Error ? err.message : "Unknown error occurred"
			);
		} finally {
			setClearing(false);
		}
	};

	const resetForm = () => {
		setMinPrice("0.1");
		setMaxPrice("0.9");
		setAmount("100");
		setResult(null);
		setError(null);
		setClearResult(null);
	};

	return (
		<div
			style={{
				marginTop: 16,
				borderTop: "1px solid rgba(255,255,255,0.2)",
				paddingTop: 12,
			}}
		>
			<div style={{ marginBottom: 8, fontWeight: 600 }}>
				Seed Order Book
			</div>

			{questionDisplayName && (
				<div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
					Market: {questionDisplayName}
				</div>
			)}

			<div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
				Seeds order book with {amount} USDC across price range{" "}
				{minPrice} - {maxPrice} with 5¢ spread
			</div>

			<div style={{ display: "grid", gap: 12, maxWidth: 400 }}>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: 8,
					}}
				>
					<label style={{ display: "grid", gap: 4 }}>
						<span style={{ fontSize: 12 }}>Min Price</span>
						<input
							type="number"
							step="0.01"
							min="0.01"
							max="0.99"
							value={minPrice}
							onChange={(e) => setMinPrice(e.target.value)}
							style={{
								padding: 6,
								color: "cyan",
								border: "1px solid white",
								borderRadius: 4,
								background: "transparent",
								fontSize: 12,
							}}
						/>
					</label>
					<label style={{ display: "grid", gap: 4 }}>
						<span style={{ fontSize: 12 }}>Max Price</span>
						<input
							type="number"
							step="0.01"
							min="0.01"
							max="0.99"
							value={maxPrice}
							onChange={(e) => setMaxPrice(e.target.value)}
							style={{
								padding: 6,
								color: "cyan",
								border: "1px solid white",
								borderRadius: 4,
								background: "transparent",
								fontSize: 12,
							}}
						/>
					</label>
				</div>

				<label style={{ display: "grid", gap: 4 }}>
					<span style={{ fontSize: 12 }}>Amount (USDC)</span>
					<input
						type="number"
						step="1"
						min="1"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						style={{
							padding: 6,
							color: "cyan",
							border: "1px solid white",
							borderRadius: 4,
							background: "transparent",
							fontSize: 12,
						}}
					/>
				</label>

				<div
					style={{
						display: "flex",
						gap: 8,
						alignItems: "center",
						flexWrap: "wrap",
					}}
				>
					<button
						type="button"
						onClick={handleSeed}
						disabled={seeding || clearing}
						style={{
							padding: "6px 12px",
							border: "1px solid #8b5cf6",
							borderRadius: 4,
							background: seeding
								? "transparent"
								: "rgba(139, 92, 246, 0.2)",
							color: "white",
							fontSize: 12,
							cursor:
								seeding || clearing ? "not-allowed" : "pointer",
							opacity: seeding || clearing ? 0.6 : 1,
						}}
					>
						{seeding ? "Seeding..." : "Seed Order Book"}
					</button>

					<button
						type="button"
						onClick={handleClear}
						disabled={seeding || clearing}
						style={{
							padding: "6px 12px",
							border: "1px solid #ef4444",
							borderRadius: 4,
							background: clearing
								? "transparent"
								: "rgba(239, 68, 68, 0.2)",
							color: "white",
							fontSize: 12,
							cursor:
								seeding || clearing ? "not-allowed" : "pointer",
							opacity: seeding || clearing ? 0.6 : 1,
						}}
					>
						{clearing ? "Clearing..." : "Clear Order Book"}
					</button>

					<button
						type="button"
						onClick={resetForm}
						disabled={seeding || clearing}
						style={{
							padding: "6px 12px",
							border: "1px solid white",
							borderRadius: 4,
							background: "transparent",
							color: "white",
							fontSize: 12,
							cursor:
								seeding || clearing ? "not-allowed" : "pointer",
							opacity: seeding || clearing ? 0.6 : 1,
						}}
					>
						Reset
					</button>
				</div>

				{result && (
					<div
						style={{
							padding: 8,
							border: "1px solid rgba(34, 197, 94, 0.3)",
							borderRadius: 4,
							background: "rgba(34, 197, 94, 0.1)",
							fontSize: 12,
						}}
					>
						<div
							style={{
								color: "#22c55e",
								fontWeight: 600,
								marginBottom: 4,
							}}
						>
							✓ Seeding Complete
						</div>
						<div style={{ opacity: 0.9 }}>
							• {result.seededNo} NO orders seeded
						</div>
						<div style={{ opacity: 0.9 }}>
							• {result.seededYes} YES orders seeded
						</div>
						<div style={{ opacity: 0.9 }}>
							• {result.levels} price levels
						</div>
						<div style={{ opacity: 0.9 }}>
							• ${result.spread} spread
						</div>
					</div>
				)}

				{clearResult && (
					<div
						style={{
							padding: 8,
							border: "1px solid rgba(34, 197, 94, 0.3)",
							borderRadius: 4,
							background: "rgba(34, 197, 94, 0.1)",
							fontSize: 12,
							color: "#22c55e",
						}}
					>
						✓ {clearResult}
					</div>
				)}

				{error && (
					<div
						style={{
							padding: 8,
							border: "1px solid rgba(239, 68, 68, 0.3)",
							borderRadius: 4,
							background: "rgba(239, 68, 68, 0.1)",
							fontSize: 12,
							color: "#ef4444",
						}}
					>
						{error}
					</div>
				)}
			</div>

			<div
				style={{
					fontSize: 10,
					opacity: 0.6,
					marginTop: 8,
					maxWidth: 400,
				}}
			>
				Creates 10 price levels with BUY NO orders (showing as SELL YES
				asks) and BUY YES orders (bids) with a 5¢ spread to avoid
				overlap.
			</div>
		</div>
	);
}
