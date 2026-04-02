import { ReactNode } from "react";

interface PortalProps {
	children: ReactNode;
}

export default function Portal(props: PortalProps): React.ReactPortal;
