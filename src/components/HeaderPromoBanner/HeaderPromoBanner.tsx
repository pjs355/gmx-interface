import { ReactNode, useCallback, useState } from "react";
import { MdOutlineClose } from "react-icons/md";

// Removed GMX localStorage imports - not needed for prediction markets

import "./HeaderPromoBanner.scss";

export function HeaderPromoBanner({ children }: { children: ReactNode }) {
	const [hidden, setHidden] = useState(false); // Simplified state without GMX localStorage
	const onClick = useCallback(() => {
		setHidden(true);
	}, [setHidden]);

	if (hidden) return null;

	return (
		<div className="HeaderPromoBanner">
			{children}
			<MdOutlineClose onClick={onClick} className="cross-icon" color="white" />
		</div>
	);
}
