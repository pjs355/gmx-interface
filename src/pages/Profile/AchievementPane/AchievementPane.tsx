import { useMedia } from "react-use";
import "./AchievementPane.scss";

type AchievementTier = "bronze" | "silver" | "gold" | null;

interface AchievementDefinition {
	id: string;
	name: string;
	description: string;
	icon: string;
	tier?: AchievementTier;
}

export interface UserAchievement {
	id: string;
	unlockedAt: string | null;
	progress?: number;
}

interface AchievementPaneProps {
	userAchievements?: UserAchievement[];
}

// Achievement definitions
const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
	// Trading Firsts
	{
		id: "first_limit_order",
		name: "Limit Setter",
		description: "Place your first limit order",
		icon: "📊",
	},
	{
		id: "first_market_order",
		name: "Market Mover",
		description: "Place your first market order",
		icon: "⚡",
	},
	{
		id: "limit_hit",
		name: "Patience Pays",
		description: "Have a limit order fill",
		icon: "🎯",
	},
	// Trade Volume - Tiered
	{
		id: "trade_markets_bronze",
		name: "Explorer",
		description: "Trade in 3 different markets",
		icon: "🗺️",
		tier: "bronze",
	},
	{
		id: "trade_markets_silver",
		name: "Adventurer",
		description: "Trade in 5 different markets",
		icon: "🗺️",
		tier: "silver",
	},
	{
		id: "trade_markets_gold",
		name: "Globetrotter",
		description: "Trade in 10 different markets",
		icon: "🗺️",
		tier: "gold",
	},
	// Daily Markets
	{
		id: "trade_daily",
		name: "Daily Trader",
		description: "Trade in a daily market",
		icon: "📅",
	},
	{
		id: "daily_streak",
		name: "Streak Master",
		description: "Trade daily markets 3 days in a row",
		icon: "🔥",
	},
	// Wins - Tiered
	{
		id: "first_win",
		name: "Winner",
		description: "Win your first market",
		icon: "🏆",
	},
	{
		id: "wins_bronze",
		name: "Contender",
		description: "Win 3 markets",
		icon: "🥇",
		tier: "bronze",
	},
	{
		id: "wins_silver",
		name: "Champion",
		description: "Win 5 markets",
		icon: "🥇",
		tier: "silver",
	},
	{
		id: "wins_gold",
		name: "Legend",
		description: "Win 10 markets",
		icon: "🥇",
		tier: "gold",
	},
	// Big Winner - Tiered
	{
		id: "big_winner_bronze",
		name: "High Roller",
		description: "Win $100+ in a single market",
		icon: "💰",
		tier: "bronze",
	},
	{
		id: "big_winner_silver",
		name: "Whale",
		description: "Win $500+ in a single market",
		icon: "💰",
		tier: "silver",
	},
	{
		id: "big_winner_gold",
		name: "Mogul",
		description: "Win $1000+ in a single market",
		icon: "💰",
		tier: "gold",
	},
	// Social & Community
	{
		id: "ping_resolve",
		name: "Vigilant",
		description: "Ping a market for resolution",
		icon: "🔔",
	},
	{
		id: "discord",
		name: "Community Member",
		description: "Link & join the Discord",
		icon: "💬",
	},
	// Ultimate
	{
		id: "completionist",
		name: "Completionist",
		description: "Unlock all achievements",
		icon: "👑",
	},
];

function getTierColor(tier: AchievementTier): string {
	if (tier === "bronze") return "#cd7f32";
	if (tier === "silver") return "#c0c0c0";
	if (tier === "gold") return "#ffd700";
	return "#8b5cf6";
}

function getTierGlow(tier: AchievementTier): string {
	if (tier === "bronze") return "0 0 20px rgba(205, 127, 50, 0.5)";
	if (tier === "silver") return "0 0 20px rgba(192, 192, 192, 0.5)";
	if (tier === "gold") return "0 0 20px rgba(255, 215, 0, 0.6)";
	return "0 0 20px rgba(139, 92, 246, 0.5)";
}

export default function AchievementPane({ userAchievements = [] }: AchievementPaneProps) {
	const isMobile = useMedia("(max-width: 768px)");

	// Create a map for quick lookup of unlocked achievements
	const unlockedMap = new Map<string, UserAchievement>();
	for (const ua of userAchievements) {
		if (ua.unlockedAt) {
			unlockedMap.set(ua.id, ua);
		}
	}

	const unlockedCount = unlockedMap.size;
	const totalCount = ACHIEVEMENT_DEFINITIONS.length;

	// Debug log to see what's coming from server
	console.log("AchievementPane - userAchievements:", userAchievements);
	console.log("AchievementPane - unlockedMap:", Object.fromEntries(unlockedMap));

	return (
		<div className="AchievementPane">
			<div className="AchievementPane-header">
				<div className="AchievementPane-title">Achievements</div>
				<div className="AchievementPane-progress">
					{unlockedCount} / {totalCount}
				</div>
			</div>

			<div
				className="AchievementPane-grid"
				style={{
					gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(6, 1fr)",
				}}
			>
				{ACHIEVEMENT_DEFINITIONS.map((achievement) => {
					const userAchievement = unlockedMap.get(achievement.id);
					const isUnlocked = Boolean(userAchievement);

					return (
						<div
							key={achievement.id}
							className={`AchievementPane-item ${
								isUnlocked ? "unlocked" : "locked"
							} ${achievement.tier ? `tier-${achievement.tier}` : ""}`}
							title={`${achievement.name}: ${achievement.description}`}
							style={
								isUnlocked && achievement.tier
									? {
											borderColor: getTierColor(achievement.tier),
											boxShadow: getTierGlow(achievement.tier),
										}
									: undefined
							}
						>
							<div className="AchievementPane-icon">{achievement.icon}</div>
							{achievement.tier && (
								<div
									className="AchievementPane-tier-badge"
									style={{
										background: getTierColor(achievement.tier),
									}}
								>
									{achievement.tier === "bronze" && "I"}
									{achievement.tier === "silver" && "II"}
									{achievement.tier === "gold" && "III"}
								</div>
							)}
							<div className="AchievementPane-name">{achievement.name}</div>
							{!isUnlocked && <div className="AchievementPane-lock">🔒</div>}
						</div>
					);
				})}
			</div>
		</div>
	);
}
