// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { rehypeLinkHeaders } from './src/plugins/rehypeLinkHeaders.js';

export default defineConfig({
	site: 'https://awsl.rip',
	integrations: [mdx(), sitemap()],
	markdown: {
		rehypePlugins: [
			rehypeLinkHeaders,
		]
	}
});
