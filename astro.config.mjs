// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import devtoolsJson from 'vite-plugin-devtools-json';
import { rehypeLinkHeaders } from './src/plugins/rehypeLinkHeaders.js';
import rehypeMermaid from 'rehype-mermaid'; 
import { rehypeMermaidSupport } from './src/plugins/rehypeAstroMermaidSupport.js';
import { SITE_URL } from './src/consts.js';

import playformCompress from '@playform/compress';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
    site: SITE_URL,
    integrations: [mdx(), sitemap(), playformCompress()],
    vite: {
        plugins: [devtoolsJson()],
    },
    markdown: {
        remarkPlugins: [
            remarkMath,
        ],
        rehypePlugins: [
            rehypeLinkHeaders,
            rehypeMermaidSupport,
            rehypeKatex,
            rehypeMermaid,
        ],
        shikiConfig: {
            theme: 'github-dark-dimmed',
            wrap: true
        }
    }
});
