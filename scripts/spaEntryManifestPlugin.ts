import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Writes `dist/spa-entry.json` after build so predictions-api can inject the
 * current hashed Vite entry assets into server-generated HTML shells.
 */
export function spaEntryManifestPlugin(): Plugin {
	return {
		name: "spa-entry-manifest",
		closeBundle() {
			const outDir = path.resolve(process.cwd(), "dist");
			const indexPath = path.join(outDir, "index.html");
			const html = fs.readFileSync(indexPath, "utf-8");

			const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
			const cssMatch = html.match(/href="(\/assets\/index-[^"]+\.css)"/);
			if (!jsMatch?.[1]) {
				throw new Error("spa-entry-manifest: could not find Vite entry JS in dist/index.html");
			}
			if (!cssMatch?.[1]) {
				throw new Error("spa-entry-manifest: could not find Vite entry CSS in dist/index.html");
			}

			const manifest = {
				js: jsMatch[1],
				css: cssMatch[1],
			};
			fs.writeFileSync(
				path.join(outDir, "spa-entry.json"),
				`${JSON.stringify(manifest, null, 2)}\n`,
				"utf-8",
			);
		},
	};
}
