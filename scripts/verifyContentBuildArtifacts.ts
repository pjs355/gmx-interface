import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "dist");

const requiredFiles = ["sitemap.xml", "robots.txt", "blog/index.html"];

for (const relativePath of requiredFiles) {
	const filePath = path.join(distDir, relativePath);
	if (!fs.existsSync(filePath)) {
		throw new Error(
			`[content-build] Missing dist/${relativePath}. SEO prerender step did not run — check contentBuildPlugin closeBundle.`,
		);
	}
}

const sitemap = fs.readFileSync(path.join(distDir, "sitemap.xml"), "utf-8");
if (!sitemap.includes("<urlset")) {
	throw new Error("[content-build] dist/sitemap.xml is not valid XML sitemap markup.");
}

console.info("[content-build] Verified sitemap.xml, robots.txt, and blog prerender artifacts.");
