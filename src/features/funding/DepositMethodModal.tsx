import { RemoveScroll } from "react-remove-scroll";
import "./DepositMethodModal.scss";

type DepositMethodModalProps = {
	open: boolean;
	onClose: () => void;
	onDepositWithCard: () => void;
	onDepositWithCrypto: () => void;
	cardDisabled?: boolean;
	cryptoDisabled?: boolean;
};

export function DepositMethodModal({
	open,
	onClose,
	onDepositWithCard,
	onDepositWithCrypto,
	cardDisabled = false,
	cryptoDisabled = false,
}: DepositMethodModalProps) {
	if (!open) return null;

	return (
		<RemoveScroll>
			<div
				className="deposit-method-modal"
				role="dialog"
				aria-modal="true"
				aria-label="Choose deposit method"
				onClick={onClose}
			>
				<div className="deposit-method-modal__card" onClick={(e) => e.stopPropagation()}>
					<div className="deposit-method-modal__header">
						<h2 className="deposit-method-modal__title">Deposit funds</h2>
						<button
							type="button"
							className="deposit-method-modal__close"
							onClick={onClose}
							aria-label="Close"
						>
							×
						</button>
					</div>

					<div className="deposit-method-modal__actions">
						<button
							type="button"
							className="deposit-method-modal__option deposit-method-modal__option--primary"
							disabled={cardDisabled}
							onClick={onDepositWithCard}
						>
							Deposit with card
						</button>
						<button
							type="button"
							className="deposit-method-modal__option deposit-method-modal__option--secondary"
							disabled={cryptoDisabled}
							onClick={onDepositWithCrypto}
						>
							Deposit with crypto
						</button>
					</div>
				</div>
			</div>
		</RemoveScroll>
	);
}

function launchAfterClose(close: () => void, action: () => Promise<void>) {
	close();
	requestAnimationFrame(() => {
		void action();
	});
}

export { launchAfterClose };
