import { useMedia } from "react-use";
import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "react-router-dom";
import { RiLogoutBoxRLine } from "react-icons/ri";
import Details from "./Details/Details";
import {
	SHOULD_EAGER_CONNECT_LOCALSTORAGE_KEY,
	CURRENT_PROVIDER_LOCALSTORAGE_KEY,
} from "config/localStorage";
import "./Profile.scss";

export default function Profile() {
	const isMobile = useMedia("(max-width: 768px)");
	const { authenticated, logout } = usePrivy();
	const navigate = useNavigate();

	// Same teardown the header drawer used to run before Privy logout.
	const handleSignOut = async () => {
		localStorage.removeItem(SHOULD_EAGER_CONNECT_LOCALSTORAGE_KEY);
		localStorage.removeItem(CURRENT_PROVIDER_LOCALSTORAGE_KEY);
		await logout();
		navigate("/");
	};

	return (
		<div
			className="profile-page"
			style={{
				paddingLeft: isMobile ? 16 : 50,
				paddingRight: isMobile ? 16 : 24,
				paddingTop: isMobile ? 16 : 24,
				paddingBottom: isMobile ? 16 : 24,
				color: "white",
			}}
		>
			<h1 className="profile-header">Account Details</h1>

			<main className="profile-content-wrapper">
				<Details />
			</main>

			{authenticated && (
				<button type="button" className="profile-signout-btn" onClick={handleSignOut}>
					<RiLogoutBoxRLine aria-hidden />
					Sign Out
				</button>
			)}
		</div>
	);
}
