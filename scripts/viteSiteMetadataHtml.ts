import type { Plugin } from "vite";
import {
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_OG_IMAGE,
	SITE_OG_IMAGE_ALT,
	SITE_OG_IMAGE_HEIGHT,
	SITE_OG_IMAGE_WIDTH,
	SITE_ORIGIN,
	SITE_TITLE,
	TWITTER_SITE,
} from "../src/config/siteMetadata";

function escapeHtmlAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

const REPLACEMENTS: Record<string, string> = {
	__SITE_TITLE__: SITE_TITLE,
	__SITE_DESCRIPTION__: SITE_DESCRIPTION,
	__SITE_ORIGIN__: SITE_ORIGIN,
	__SITE_OG_IMAGE__: SITE_OG_IMAGE,
	__SITE_NAME__: SITE_NAME,
	__TWITTER_SITE__: TWITTER_SITE,
	__SITE_OG_IMAGE_WIDTH__: String(SITE_OG_IMAGE_WIDTH),
	__SITE_OG_IMAGE_HEIGHT__: String(SITE_OG_IMAGE_HEIGHT),
	__SITE_OG_IMAGE_ALT__: SITE_OG_IMAGE_ALT,
};

/** Inject `siteMetadata.ts` into `index.html` so crawlers and Helmet stay aligned. */
export function siteMetadataHtmlPlugin(): Plugin {
	return {
		name: "site-metadata-html",
		transformIndexHtml(html) {
			let out = html;
			for (const [token, value] of Object.entries(REPLACEMENTS)) {
				out = out.replaceAll(token, escapeHtmlAttr(value));
			}
			return out;
		},
	};
}
