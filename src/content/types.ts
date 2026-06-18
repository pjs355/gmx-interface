export type ContentFaq = {
	question: string;
	answer: string;
};

export type ContentSource = {
	label: string;
	url: string;
};

export type ContentPageBase = {
	title: string;
	description: string;
	slug: string;
	publishedAt: string;
	updatedAt: string;
	pillar: string;
	funnelStage: string;
	targetKeyword: string;
	sortPriority?: number;
	schemaProfile?: string;
	seoKeywords?: string;
	faqs: ContentFaq[];
	sources: ContentSource[];
	markdownBody: string;
	htmlBody: string;
	directAnswer: string;
};

export type BlogPost = ContentPageBase & {
	kind: "blog";
	canonicalPath: string;
};

export type LanderPage = ContentPageBase & {
	kind: "lander";
	canonicalPath: string;
};

export type ContentManifest = {
	generatedAt: string;
	blogPosts: BlogPost[];
	landers: LanderPage[];
};
