import { glob } from 'astro/loaders';
import { defineCollection, z, reference } from 'astro:content';
import type { Heading } from './types/Heading.ts';

const headingType: z.ZodType<Heading> = z.lazy(() =>
	z.object({
		level: z.number(),
		id: z.string(),
		title: z.string(),
		children: z.array(headingType).optional()
	}
)) satisfies z.ZodType<Heading>;

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content', pattern: '**/index.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) => z.object({
		title: z.string(),

		// Transform string to Date object
		pubDate: z.coerce.date(),

		// Indexes
		indexHeadings: z.array(headingType).optional()
	}),
});

const category = defineCollection({
	loader: glob({ base: './src/content', pattern: '*/index.yaml' }),
	schema: ({ image }) => z.object({
		title: z.string(),
		bgColor: z.string().optional(),
		background: image().optional(),
		// blogs: z.array(z.union([reference("blog"), reference("serie")]))
	}),
});

const serie = defineCollection( {
	loader: glob({ base: './src/content', pattern: '*/*/index.yaml'}),
	schema: () => z.object({
		title: z.string(),
		// blogs: z.array(reference("blog")),
	})
})

export const collections = { blog, category, serie };
