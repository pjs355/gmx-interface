import { useMedia } from "react-use";
import Details from "./Details/Details";
import "./Profile.scss";

export default function Profile() {
	const isMobile = useMedia("(max-width: 768px)");

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
		</div>
	);
}
