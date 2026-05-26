import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { REQUESTED_VENUES } from "../e2e/fixtures/requested-venues";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRINX_INTERFACE_DIR = path.resolve(__dirname, "..");
const PREDICTIONS_API_DIR = path.resolve(PRINX_INTERFACE_DIR, "..", "predictions-api");

const FRONTEND_PORT = 3010;
const PREDICTIONS_API_PORT = 8080;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const PREDICTIONS_API_URL = `http://localhost:${PREDICTIONS_API_PORT}`;
const E2E_USER_DATA_DIR = path.join(PRINX_INTERFACE_DIR, "e2e", ".user-data");

/** When true: build both repos, spawn API + vite preview, run tests, tear down. */
function parseBootstrapFlag(): boolean {
	return process.argv.includes("--bootstrap") || process.argv.includes("--spawn-and-build");
}

type ChildHandle = {
	name: string;
	proc: ChildProcess;
	stopped: boolean;
};

const children: ChildHandle[] = [];
let shuttingDown = false;

async function shutdownAll(): Promise<void> {
	if (children.length === 0) return;
	shuttingDown = true;
	for (const child of children) {
		if (child.stopped) continue;
		child.stopped = true;
		try {
			console.log(`[predeploy] stopping ${child.name} (pid ${child.proc.pid})`);
			child.proc.kill("SIGTERM");
		} catch (err) {
			console.error("error", err);
		}
	}
	await sleep(2_000);
	for (const child of children) {
		try {
			if (child.proc.killed) continue;
			child.proc.kill("SIGKILL");
		} catch (err) {
			console.error("error", err);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function runStep(name: string, cmd: string, args: string[], cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		console.log(`[predeploy] [${name}] ${cmd} ${args.join(" ")} (cwd=${cwd})`);
		const proc = spawn(cmd, args, {
			cwd,
			stdio: "inherit",
			shell: false,
		});
		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`[${name}] exited with code ${code}`));
			}
		});
		proc.on("error", (err) => {
			console.error("error", err);
			reject(err);
		});
	});
}

function startBackground(
	name: string,
	cmd: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): ChildHandle {
	console.log(`[predeploy] [${name}] starting: ${cmd} ${args.join(" ")} (cwd=${cwd})`);
	const proc = spawn(cmd, args, {
		cwd,
		stdio: "inherit",
		shell: false,
		env,
	});
	const handle: ChildHandle = { name, proc, stopped: false };
	children.push(handle);
	proc.on("exit", (code, signal) => {
		if (shuttingDown || handle.stopped) return;
		console.error(`[predeploy] [${name}] exited unexpectedly (code=${code}, signal=${signal})`);
	});
	return handle;
}

async function waitForHttp(url: string, timeoutMs: number, label: string): Promise<void> {
	const start = Date.now();
	let lastErr: unknown = null;
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.ok || res.status === 304) {
				console.log(`[predeploy] ${label} ready (${res.status}) after ${Date.now() - start}ms`);
				return;
			}
			lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
		} catch (err) {
			lastErr = err;
		}
		await sleep(1_000);
	}
	console.error("error", lastErr);
	throw new Error(
		`${label} did not respond at ${url} within ${timeoutMs}ms: ${
			lastErr instanceof Error ? lastErr.message : String(lastErr)
		}`,
	);
}

interface ExchangeMatching {
	[key: string]: unknown;
}
interface MatchedMarketRow {
	pandaMatchId: string;
	umbrellaId: string;
	displayName: string;
	eventDate?: string;
	exchangeMatching: ExchangeMatching;
}

function missingRequestedVenues(row: MatchedMarketRow): string[] {
	return REQUESTED_VENUES.filter((k) => row.exchangeMatching?.[k] === undefined);
}

function assertE2eUserDataExists(): void {
	if (!fs.existsSync(E2E_USER_DATA_DIR)) {
		throw new Error(
			`Playwright persistent profile missing: ${E2E_USER_DATA_DIR}\n` +
				`Run once from prinx-interface:  yarn e2e:seed-profile\n` +
				`Complete Privy login in the browser window, then close it. ` +
				`Re-run yarn predeploy after that.`,
		);
	}
	if (!fs.statSync(E2E_USER_DATA_DIR).isDirectory()) {
		throw new Error(`E2E user-data path exists but is not a directory: ${E2E_USER_DATA_DIR}`);
	}
}

async function probeMatchedMarkets(): Promise<void> {
	if (REQUESTED_VENUES.length === 0) {
		throw new Error(
			"REQUESTED_VENUES is empty: uncomment at least one venue in e2e/fixtures/requested-venues.ts before running predeploy.",
		);
	}
	const url = `${PREDICTIONS_API_URL}/matched-markets`;
	console.log(`[predeploy] probing ${url}`);
	console.log(
		`[predeploy] requested venues (per-venue coverage; no longer require one row with all): ${REQUESTED_VENUES.join(", ")}`,
	);
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`GET ${url} returned ${res.status} ${res.statusText}`);
	}
	const body = (await res.json()) as MatchedMarketRow[];
	if (!Array.isArray(body)) {
		throw new Error(`GET ${url} did not return an array`);
	}
	const now = Date.now();
	const future = body.filter((r) => {
		if (!r.eventDate) return false;
		const t = Date.parse(r.eventDate);
		return Number.isFinite(t) && t > now;
	});

	for (const v of REQUESTED_VENUES) {
		const n = future.filter((r) => r.exchangeMatching?.[v] !== undefined).length;
		if (n === 0) {
			console.log(
				`[predeploy] venue "${v}": no upcoming matched-markets rows with exchangeMatching.${v} — Playwright will skip that venue.`,
			);
		} else {
			console.log(
				`[predeploy] venue "${v}": ${n} upcoming row(s) include ${v} in exchangeMatching`,
			);
		}
	}

	const anyCoverage = REQUESTED_VENUES.some((v) =>
		future.some((r) => r.exchangeMatching?.[v] !== undefined),
	);
	if (future.length > 0 && !anyCoverage) {
		console.warn(
			`[predeploy] ${future.length} upcoming rows but none populate any REQUESTED_VENUES keys — venue blocks will skip unless data changes.`,
		);
	}

	const ranked = future
		.map((r) => ({ row: r, missing: missingRequestedVenues(r) }))
		.sort((a, b) => a.missing.length - b.missing.length)
		.slice(0, 5);
	console.log(`[predeploy] Searched ${body.length} rows; ${future.length} upcoming (reference)`);
	console.log("[predeploy] Top 5 upcoming rows by requested-venue coverage (fewest gaps first):");
	for (const e of ranked) {
		console.log(
			`[predeploy]   - ${e.row.displayName} (${e.row.umbrellaId}) event=${e.row.eventDate}; missing from requested set: ${e.missing.join(", ") || "(none)"}`,
		);
	}
}

async function main(): Promise<void> {
	const bootstrap = parseBootstrapFlag();

	if (bootstrap && !fs.existsSync(PREDICTIONS_API_DIR)) {
		throw new Error(
			`--bootstrap requires predictions-api at ${PREDICTIONS_API_DIR} (sibling of prinx-interface).`,
		);
	}

	console.log(
		`[predeploy] mode: ${bootstrap ? "--bootstrap (build + spawn + teardown)" : "default (use servers you already started; full shell env applies)"}`,
	);

	console.log("[predeploy] verifying Playwright persistent profile at e2e/.user-data/ …");
	assertE2eUserDataExists();

	if (bootstrap) {
		console.log("[predeploy] === bootstrap: build predictions-api ===");
		await runStep("api-build", "npm", ["run", "build"], PREDICTIONS_API_DIR);

		console.log("[predeploy] === bootstrap: build prinx-interface ===");
		await runStep("ui-build", "yarn", ["build"], PRINX_INTERFACE_DIR);

		console.log("[predeploy] === bootstrap: start predictions-api ===");
		startBackground("predictions-api", "node", ["dist/cjs/server.js"], PREDICTIONS_API_DIR, {
			...process.env,
			PORT: String(PREDICTIONS_API_PORT),
		});
		await waitForHttp(`${PREDICTIONS_API_URL}/health`, 120_000, "predictions-api /health");
	} else {
		console.log(
			`[predeploy] waiting for already-running services (no spawn; uses your terminals' env):`,
		);
		console.log(`[predeploy]   ${PREDICTIONS_API_URL}/health`);
		console.log(`[predeploy]   ${FRONTEND_URL}/`);
		await waitForHttp(`${PREDICTIONS_API_URL}/health`, 120_000, "predictions-api /health");
		await waitForHttp(FRONTEND_URL, 120_000, "prinx-interface (or preview) /");
	}

	console.log("[predeploy] === probe /matched-markets ===");
	await probeMatchedMarkets();

	if (bootstrap) {
		console.log("[predeploy] === bootstrap: serve prinx-interface (vite preview) ===");
		startBackground(
			"prinx-interface",
			"yarn",
			["preview", "--port", String(FRONTEND_PORT), "--strictPort", "--host", "127.0.0.1"],
			PRINX_INTERFACE_DIR,
			{ ...process.env },
		);
		await waitForHttp(FRONTEND_URL, 120_000, "prinx-interface preview /");
	}

	console.log("[predeploy] === run playwright ===");
	await runStep(
		"playwright",
		"npx",
		[
			"playwright",
			"test",
			"--config",
			path.join(PRINX_INTERFACE_DIR, "e2e", "playwright.config.ts"),
		],
		PRINX_INTERFACE_DIR,
	);

	if (bootstrap) {
		console.log("[predeploy] === bootstrap: tear down spawned services ===");
		await shutdownAll();
	}

	console.log("[predeploy] GREEN. Suite passed; safe to run `railway up` when you are ready. ===");
}

process.on("SIGINT", () => {
	console.log("[predeploy] SIGINT received");
	void shutdownAll().then(() => process.exit(130));
});
process.on("SIGTERM", () => {
	console.log("[predeploy] SIGTERM received");
	void shutdownAll().then(() => process.exit(143));
});

main()
	.then(() => process.exit(0))
	.catch(async (err) => {
		console.error("error", err);
		await shutdownAll();
		process.exit(1);
	});
