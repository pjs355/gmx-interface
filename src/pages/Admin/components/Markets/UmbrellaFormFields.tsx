import type { Umbrella } from "@/services/api/umbrellaDataService";

interface UmbrellaFormFieldsProps {
	selectedUmbrellaId?: string;
	umbrellas: Umbrella[];
	umbrellaDisplayName: string;
	umbrellaRule: string;
	onDisplayNameChange: (value: string) => void;
	onRuleChange: (value: string) => void;
}

export default function UmbrellaFormFields({
	selectedUmbrellaId,
	umbrellas,
	umbrellaDisplayName,
	umbrellaRule,
	onDisplayNameChange,
	onRuleChange,
}: UmbrellaFormFieldsProps) {
	// If an umbrella is selected, show its existing questions
	if (selectedUmbrellaId) {
		const selectedUmbrella = umbrellas.find((u) => u._id === selectedUmbrellaId);

		if (!selectedUmbrella) {
			return null;
		}

		const children = Array.isArray(selectedUmbrella.children) ? selectedUmbrella.children : [];

		return (
			<div
				style={{
					border: "1px solid rgba(255,255,255,0.2)",
					borderRadius: 8,
					padding: 12,
					background: "rgba(255,255,255,0.03)",
				}}
			>
				<div style={{ marginBottom: 8, fontWeight: 600 }}>
					Existing questions in "{selectedUmbrella.displayName}" ({children.length})
				</div>

				{children.length === 0 ? (
					<div style={{ opacity: 0.8 }}>No questions found under this umbrella.</div>
				) : (
					<ul
						style={{
							listStyle: "disc",
							paddingLeft: 20,
							margin: 0,
							color: "white",
						}}
					>
						{children.map((child) => (
							<li key={child.questionId} style={{ marginBottom: 6 }}>
								<span style={{ color: "white" }}>{child.displayName}</span>
								<span style={{ color: "#9ca3af" }}>{" — "}</span>
								<span
									style={{
										color: "#9ca3af",
										fontSize: 12,
									}}
								>
									id: {child.questionId}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
		);
	}

	// If no umbrella is selected, show fields to create a new one
	return (
		<>
			<label style={{ display: "grid", gap: 6 }}>
				<span>Umbrella Display Name</span>
				<input
					value={umbrellaDisplayName}
					onChange={(e) => onDisplayNameChange(e.target.value)}
					placeholder="If empty, defaults to Question text"
					style={{
						padding: 8,
						color: "cyan",
						border: "1px solid white",
						borderRadius: "4px",
						background: "transparent",
					}}
				/>
			</label>

			<label style={{ display: "grid", gap: 6 }}>
				<span>Umbrella Rules (optional)</span>
				<textarea
					value={umbrellaRule}
					onChange={(e) => onRuleChange(e.target.value)}
					placeholder="Add any adjudication/rules text for this umbrella"
					rows={4}
					style={{
						padding: 8,
						color: "cyan",
						border: "1px solid white",
						borderRadius: "4px",
						background: "transparent",
					}}
				/>
			</label>
		</>
	);
}
