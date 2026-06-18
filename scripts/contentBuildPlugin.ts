import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

import { loadContentManifest } from "./contentBuild/parseContentFiles";
import {
	renderBlogIndexHtml,
	renderBlogPostHtml,
	renderLearnIndexHtml,
	renderLanderHtml,
	patchHomeIndexHtml,
} from "./contentBuild/renderPrerenderHtml";
import { buildRobotsTxt, buildSitemapXml } from "./contentBuild/sitemapRobots";
import type { SpaEntryAssets } from "./contentBuild/types";

const VIRTUAL_MODULE_ID = "virtual:content-manifest";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

function readSpaAssets(distDir: string): SpaEntryAssets {
	const indexPath = path.join(distDir, "index.html");
	const html = fs.readFileSync(indexPath, "utf-8");
	const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
	const cssMatch = html.match(/href="(\/assets\/index-[^"]+\.css)"/);
	if (!jsMatch?.[1]) {
		throw new Error("[content-build] Could not find Vite entry JS in dist/index.html");
	}
	if (!cssMatch?.[1]) {
		throw new Error("[content-build] Could not find Vite entry CSS in dist/index.html");
	}
	return { js: jsMatch[1], css: cssMatch[1] };
}

function writePrerenderPages(projectRoot: string, distDir: string, spa: SpaEntryAssets): void {
	const manifest = loadContentManifest(projectRoot);

	const blogDir = path.join(distDir, "blog");
	fs.mkdirSync(blogDir, { recursive: true });
	fs.writeFileSync(path.join(blogDir, "index.html"), renderBlogIndexHtml(manifest, spa), "utf-8");

	for (const post of manifest.blogPosts) {
		const postDir = path.join(blogDir, post.slug);
		fs.mkdirSync(postDir, { recursive: true });
		fs.writeFileSync(path.join(postDir, "index.html"), renderBlogPostHtml(post, spa), "utf-8");
	}

	const learnDir = path.join(distDir, "learn");
	fs.mkdirSync(learnDir, { recursive: true });
	fs.writeFileSync(path.join(learnDir, "index.html"), renderLearnIndexHtml(manifest, spa), "utf-8");

	for (const lander of manifest.landers) {
		const landerDir = path.join(learnDir, lander.slug);
		fs.mkdirSync(landerDir, { recursive: true });
		fs.writeFileSync(path.join(landerDir, "index.html"), renderLanderHtml(lander, spa), "utf-8");
	}

	fs.writeFileSync(path.join(distDir, "sitemap.xml"), buildSitemapXml(manifest), "utf-8");
	fs.writeFileSync(path.join(distDir, "robots.txt"), buildRobotsTxt(), "utf-8");

	const indexPath = path.join(distDir, "index.html");
	fs.writeFileSync(indexPath, patchHomeIndexHtml(fs.readFileSync(indexPath, "utf-8")), "utf-8");

	const generatedDir = path.join(projectRoot, "src/generated");
	fs.mkdirSync(generatedDir, { recursive: true });
	fs.writeFileSync(
		path.join(generatedDir, "content-manifest.json"),
		JSON.stringify(manifest, null, 2),
		"utf-8",
	);

	console.info(
		`[content-build] ${manifest.blogPosts.length} blog posts, ${manifest.landers.length} landers, sitemap + robots written`,
	);
}

export function contentBuildPlugin(projectRoot: string): Plugin {
	let manifestJson = JSON.stringify(loadContentManifest(projectRoot));

	function refreshManifest(): void {
		manifestJson = JSON.stringify(loadContentManifest(projectRoot));
	}

	return {
		name: "content-build",
		resolveId(id) {
			if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
		},
		load(id) {
			if (id === RESOLVED_VIRTUAL_MODULE_ID) {
				return `export default ${manifestJson};`;
			}
		},
		buildStart() {
			refreshManifest();
		},
		configureServer(server) {
			const blogDir = path.join(projectRoot, "content/blog");
			const landerDir = path.join(projectRoot, "content/landers");
			const watchPaths = [blogDir, landerDir].filter((p) => fs.existsSync(p));
			for (const watchPath of watchPaths) {
				server.watcher.add(watchPath);
			}
			server.watcher.on("change", (file) => {
				if (file.includes(`${path.sep}content${path.sep}`) && file.endsWith(".md")) {
					refreshManifest();
					const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
					if (mod) server.reloadModule(mod);
				}
			});
		},
		closeBundle() {
			const distDir = path.resolve(projectRoot, "dist");
			if (!fs.existsSync(path.join(distDir, "index.html"))) {
				console.warn("[content-build] dist/index.html missing; skipping prerender");
				return;
			}
			const spa = readSpaAssets(distDir);
			writePrerenderPages(projectRoot, distDir, spa);
		},
	};
}
