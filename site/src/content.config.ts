import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { repositoryDocs } from './lib/docs-loader';

const docs = defineCollection({
  loader: repositoryDocs(),
  schema: z.object({
    title: z.string(),
    label: z.string(),
    description: z.string(),
    group: z.string(),
    order: z.number(),
    source: z.url(),
  }),
});

export const collections = { docs };
