import { useCallback, useState } from "react";
import { useDepositFunding } from "./useDepositFunding";
import { DepositMethodModal, launchAfterClose } from "./DepositMethodModal";

type DepositFundingPanelProps = {
	onComplete?: () => void;
};

export function DepositFundingPanel({ onComplete }: DepositFundingPanelProps) {
	const [methodOpen, setMethodOpen] = useState(false);
	const funding = useDepositFunding({ onComplete });

	const canDeposit = funding.canBuyWithCard || funding.canSendCrypto;

	const closeMethodModal = useCallback(() => setMethodOpen(false), []);

	const handleDepositWithCard = useCallback(() => {
		launchAfterClose(closeMethodModal, funding.buyWithCard);
	}, [closeMethodModal, funding.buyWithCard]);

	const handleDepositWithCrypto = useCallback(() => {
		launchAfterClose(closeMethodModal, funding.sendCrypto);
	}, [closeMethodModal, funding.sendCrypto]);

	return (
		<>
			<button
				type="button"
				className="transfers-btn transfers-btn-deposit"
				disabled={!canDeposit || funding.loading}
				onClick={() => setMethodOpen(true)}
			>
				Deposit Funds
			</button>

			<DepositMethodModal
				open={methodOpen}
				onClose={closeMethodModal}
				onDepositWithCard={handleDepositWithCard}
				onDepositWithCrypto={handleDepositWithCrypto}
				cardDisabled={!funding.canBuyWithCard || funding.loading}
				cryptoDisabled={!funding.canSendCrypto || funding.loading}
			/>
		</>
	);
}
