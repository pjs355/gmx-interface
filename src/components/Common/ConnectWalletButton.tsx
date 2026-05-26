import { ReactNode } from "react";

import "./ConnectWalletButton.scss";

type Props = {
	children: ReactNode;
	onClick: () => void;
};

export default function ConnectWalletButton({ children, onClick }: Props) {
	return (
		<button data-qa="connect-wallet-button" className="connect-wallet-btn" onClick={onClick}>
			<span className="btn-label">{children}</span>
		</button>
	);
}
