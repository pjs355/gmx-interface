import readline from "readline";
import { spawn, type ChildProcess } from "child_process";

const COLORS = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	magenta: "\x1b[35m",
	dim: "\x1b[2m",
};

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

type ViteEnvironmentMode = "production" | "local" | "local-production";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
	return new Promise((resolve) => {
		const child: ChildProcess = spawn(command, args, {
			stdio: "inherit",
			shell: true,
			env,
		});
		child.on("close", (code) => resolve(code ?? 1));
	});
}

console.log(`
${COLORS.cyan}${COLORS.bright}╔══════════════════════════════════════════════════════════════╗
║                   LevelUp Predictions                        ║
║              Production Build + Preview (:3010)              ║
╚══════════════════════════════════════════════════════════════╝${COLORS.reset}

${COLORS.dim}Unlike yarn dev, preview serves a built bundle — API URLs are baked in at build time.
This script rebuilds dist/ with your choice, then runs vite preview on port 3010.${COLORS.reset}
`);

console.log(`${COLORS.bright}Select API target for the build:${COLORS.reset}
  
  ${COLORS.green}[1] LIVE${COLORS.reset}  ${COLORS.dim}→ Production API (Railway)${COLORS.reset}
      ${COLORS.dim}API: https://prediction-api-production.up.railway.app${COLORS.reset}
  
  ${COLORS.yellow}[2] LOCAL${COLORS.reset} ${COLORS.dim}→ Local API :8080${COLORS.reset}
      ${COLORS.dim}API: http://localhost:8080${COLORS.reset}
  
  ${COLORS.magenta}[3] DEV${COLORS.reset}   ${COLORS.dim}→ Unified local API on :8080 (local-production mode)${COLORS.reset}
      ${COLORS.dim}Sets VITE_PREDICTION_API_BASE_URL=http://localhost:8080${COLORS.reset}
`);

rl.question(`${COLORS.magenta}Enter choice (1, 2, or 3): ${COLORS.reset}`, async (answer) => {
	rl.close();

	const choice = answer.trim();
	let envMode: ViteEnvironmentMode;

	if (choice === "1" || choice.toLowerCase() === "live") {
		envMode = "production";
		console.log(`\n${COLORS.green}✓ LIVE — building against production API${COLORS.reset}`);
	} else if (choice === "2" || choice.toLowerCase() === "local") {
		envMode = "local";
		console.log(
			`\n${COLORS.yellow}✓ LOCAL — building against http://localhost:8080${COLORS.reset}`,
		);
	} else if (choice === "3" || choice.toLowerCase() === "dev") {
		envMode = "local-production";
		console.log(
			`\n${COLORS.magenta}✓ DEV — building against http://localhost:8080 (local-production)${COLORS.reset}`,
		);
	} else {
		envMode = "local";
		console.log(`\n${COLORS.yellow}⚠ Invalid choice, defaulting to LOCAL (:8080)${COLORS.reset}`);
	}

	const localPredictionApi =
		envMode === "local-production" ? { VITE_PREDICTION_API_BASE_URL: "http://localhost:8080" } : {};

	const buildEnv: NodeJS.ProcessEnv = {
		...process.env,
		VITE_ENVIRONMENT_MODE: envMode,
		...localPredictionApi,
	};

	console.log(
		`\n${COLORS.dim}Building production bundle (import.meta.env.PROD = true)…${COLORS.reset}\n`,
	);

	const buildCode = await run("yarn", ["build"], buildEnv);
	if (buildCode !== 0) {
		process.exit(buildCode);
	}

	console.log(`\n${COLORS.dim}Starting preview on http://localhost:3010 …${COLORS.reset}\n`);

	const previewCode = await run("yarn", ["preview:serve"], buildEnv);
	process.exit(previewCode);
});
