// Load all RPG frame images using Vite's glob import
const frameModules = import.meta.glob("@/assets/rpg/frames/*.png", {
	eager: true,
	as: "url",
}) as Record<string, string>;

// Build map of frame filename -> URL
const frameMap: Record<string, string> = {};
Object.entries(frameModules).forEach(([path, url]) => {
	const fileName =
		path
			.split("/")
			.pop()
			?.replace(/\.[^.]+$/, "") || "";
	frameMap[fileName] = url;
});

// Helper to get frame URL by filename (without extension)
function getFrameUrl(filename: string): string {
	return frameMap[filename] || frameMap["frame_01"] || "";
}

// RPG Configuration
export interface LevelConfig {
	level: number;
	minExp: number;
	maxExp: number;
	frameAsset: string;
	frameName: string;
}

export const LEVEL_CONFIGS: LevelConfig[] = [
	{
		level: 1,
		minExp: 0,
		maxExp: 99,
		frameAsset: getFrameUrl("frame_01"),
		frameName: "Novice",
	},
	{
		level: 2,
		minExp: 100,
		maxExp: 249,
		frameAsset: getFrameUrl("frame_02"),
		frameName: "Apprentice",
	},
	{
		level: 3,
		minExp: 250,
		maxExp: 499,
		frameAsset: getFrameUrl("frame_03"),
		frameName: "Adept",
	},
	{
		level: 4,
		minExp: 500,
		maxExp: 999,
		frameAsset: getFrameUrl("frame_04"),
		frameName: "Expert",
	},
	{
		level: 5,
		minExp: 1000,
		maxExp: 1999,
		frameAsset: getFrameUrl("frame_05"),
		frameName: "Master",
	},
	{
		level: 6,
		minExp: 2000,
		maxExp: 4999,
		frameAsset: getFrameUrl("frame_06"),
		frameName: "Grandmaster",
	},
	{
		level: 7,
		minExp: 5000,
		maxExp: 9999,
		frameAsset: getFrameUrl("frame_07"),
		frameName: "Legend",
	},
	{
		level: 8,
		minExp: 10000,
		maxExp: 19999,
		frameAsset: getFrameUrl("frame_08"),
		frameName: "Mythic",
	},
	{
		level: 9,
		minExp: 20000,
		maxExp: 49999,
		frameAsset: getFrameUrl("frame_08"),
		frameName: "Mythic",
	},
	{
		level: 10,
		minExp: 50000,
		maxExp: 99999,
		frameAsset: getFrameUrl("frame_08"),
		frameName: "Mythic",
	},
];

// Calculate level from experience
export function getLevelFromExp(exp: number): LevelConfig {
	for (let i = LEVEL_CONFIGS.length - 1; i >= 0; i--) {
		const config = LEVEL_CONFIGS[i];
		if (exp >= config.minExp) {
			return config;
		}
	}
	return LEVEL_CONFIGS[0];
}

// Get progress to next level
export function getProgressToNextLevel(exp: number): {
	current: number;
	next: number;
	progress: number; // 0-1
} {
	const currentLevel = getLevelFromExp(exp);

	// Check if at max level (100)
	if (currentLevel.level >= 100) {
		return {
			current: exp - currentLevel.minExp,
			next: currentLevel.maxExp - currentLevel.minExp,
			progress: 1,
		};
	}

	const expInCurrentLevel = exp - currentLevel.minExp;
	const expNeededForMax = currentLevel.maxExp - currentLevel.minExp;
	const progress = Math.min(expInCurrentLevel / expNeededForMax, 1);

	return {
		current: expInCurrentLevel,
		next: expNeededForMax,
		progress,
	};
}

// Local storage key for cached exp
export const CACHED_EXP_KEY = "rpg_cached_exp";
