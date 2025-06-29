import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';
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
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) => z.object({
		title: z.string(),
		description: z.string(),

		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: image().optional(),

		// Indexes
		indexHeadings: z.array(headingType).optional()
	}),
});

export const collections = { blog };
