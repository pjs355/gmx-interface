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

console.log(`
${COLORS.cyan}${COLORS.bright}╔══════════════════════════════════════════════════════════════╗
║                   LevelUp Predictions                        ║
║                    Development Server                        ║
╚══════════════════════════════════════════════════════════════╝${COLORS.reset}
`);

console.log(`${COLORS.bright}Select environment:${COLORS.reset}
  
  ${COLORS.green}[1] LIVE${COLORS.reset}  ${COLORS.dim}→ Production API + production contracts${COLORS.reset}
      ${COLORS.dim}API: https://prediction-api-production.up.railway.app${COLORS.reset}
  
  ${COLORS.yellow}[2] LOCAL${COLORS.reset} ${COLORS.dim}→ Local API :8080 + production contracts${COLORS.reset}
      ${COLORS.dim}API: http://localhost:8080${COLORS.reset}
  
  ${COLORS.magenta}[3] DEV${COLORS.reset}   ${COLORS.dim}→ Production contracts + unified local API on :8080${COLORS.reset}
      ${COLORS.dim}Umbrellas, multiplex /ws, orderbook REST, matched-markets, venue-prices → http://localhost:8080${COLORS.reset}
      ${COLORS.dim}(Sets VITE_PREDICTION_API_BASE_URL for this session.)${COLORS.reset}
      ${COLORS.dim}Override port: VITE_PRIVATE_API_BASE / VITE_PREDICTION_API_BASE_URL in .env${COLORS.reset}
`);

rl.question(`${COLORS.magenta}Enter choice (1, 2, or 3): ${COLORS.reset}`, (answer) => {
	const choice = answer.trim();
	let envMode: ViteEnvironmentMode;

	if (choice === "1" || choice.toLowerCase() === "live") {
		envMode = "production";
		console.log(`\n${COLORS.green}✓ LIVE environment${COLORS.reset}`);
	} else if (choice === "2" || choice.toLowerCase() === "local") {
		envMode = "local";
		console.log(
			`\n${COLORS.yellow}✓ LOCAL: http://localhost:8080 + production contracts${COLORS.reset}`,
		);
	} else if (choice === "3" || choice.toLowerCase() === "dev") {
		envMode = "local-production";
		console.log(
			`\n${COLORS.magenta}✓ DEV: unified prediction API http://localhost:8080 + production contracts${COLORS.reset}`,
		);
	} else {
		envMode = "local";
		console.log(`\n${COLORS.yellow}⚠ Invalid choice, defaulting to LOCAL (:8080)${COLORS.reset}`);
	}

	console.log(`
${COLORS.bright}Railway proxy (EU egress):${COLORS.reset}
  ${COLORS.cyan}[y]${COLORS.reset} ${COLORS.dim}→ CLOB via /proxy; Predict orders via /proxy on LIVE [1], or LOCAL/DEV if .env sets VITE_AMSTERDAM_PROXY_LEVELUP_API_URL${COLORS.reset}
  ${COLORS.dim}[n]${COLORS.reset} ${COLORS.dim}→ Direct CLOB; private API → localhost / VITE_PRIVATE_API_BASE${COLORS.reset}
`);

	rl.question(`${COLORS.cyan}Use Railway proxy? (y/n): ${COLORS.reset}`, (proxyAnswer) => {
		rl.close();

		const useProxy = proxyAnswer.trim().toLowerCase().startsWith("y");
		if (useProxy) {
			console.log(
				`${COLORS.cyan}✓ Railway proxy: CLOB + Predict orders (LIVE; LOCAL/DEV if tunnel URL set)${COLORS.reset}\n`,
			);
		} else {
			console.log(`${COLORS.dim}✓ Direct routing (no Railway proxy)${COLORS.reset}\n`);
		}

		const localPredictionApi =
			envMode === "local-production"
				? { VITE_PREDICTION_API_BASE_URL: "http://localhost:8080" }
				: {};

		const vite: ChildProcess = spawn("npx", ["vite"], {
			stdio: "inherit",
			env: {
				...process.env,
				VITE_ENVIRONMENT_MODE: envMode,
				...(useProxy ? { VITE_POLYMARKET_CLOB_PROXY: "true" } : {}),
				...localPredictionApi,
			},
		});

		vite.on("close", (code) => {
			process.exit(code ?? 0);
		});
	});
});
